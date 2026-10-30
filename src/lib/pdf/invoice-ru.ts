import Decimal from "decimal.js";
import * as XLSX from "xlsx/xlsx.js";

import { needsInvoiceReview } from "@/lib/pdf/integrity";
import { InvoiceDocumentParseError } from "@/lib/pdf/invoice-document-parser";
import { parseRuInvoiceDate } from "@/lib/pdf/parser-ru";
import { normalizeMoney, normalizeSpaces } from "@/lib/pdf/shared";
import type { ParsedLineItem, ParsedParty, ParsedVatInvoice } from "@/lib/pdf/types";

const ExactDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class UnsupportedRuInvoiceXlsError extends InvoiceDocumentParseError {}

const HEADER =
  /Сч[её]т(?:\s+на\s+оплату)?\s*(?:№|М[оoеe]|N[оoº°9]?)\s*([\p{L}\d./-]+)\s+от\s+(\d{1,2}\s+[а-яё]+\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{4})/giu;
const MONEY = "(\\d+(?:[ \\u00a0]\\d{3})*[,.]\\d{2})";

export const isRuPaymentInvoice = (text: string): boolean =>
  !/Сч[её]т-фактура\s*№/iu.test(text) &&
  /Сч[её]т(?:\s+на\s+оплату)?\s*(?:№|М[оoеe]|N[оoº°9]?)\s*[\p{L}\d./-]+\s+от\s+/iu.test(text);

export const countRuPaymentInvoices = (text: string): number =>
  /Сч[её]т-фактура\s*№/iu.test(text)
    ? 0
    : Array.from(
        text.matchAll(
          /(?:Предварительный\s+)?Сч[её]т(?:\s+на\s+оплату)?\s*(?:№|М[оoеe]|N[оoº°9Q2]?)/giu,
        ),
      ).length;

const required = (value: string | undefined, field: string): string => {
  if (!value) throw new InvoiceDocumentParseError(`Field not found: ${field}`);
  return value;
};

const parseParty = (block: string): ParsedParty => ({
  name: normalizeSpaces(block.split(/,?\s*ИНН\s*/iu)[0] ?? ""),
  taxId: block.match(/ИНН\s*(\d{12}|\d{10})(?!\d)/iu)?.[1] ?? null,
  kpp: block.match(/КПП\s*(\d{9})(?!\d)/iu)?.[1] ?? null,
});

const lineItem = (input: {
  lineNo: number;
  description: string;
  quantity: string;
  unitName: string;
  unitPrice: string;
  amount: string;
  vatRate: string | null;
  vat: string;
  vatIncluded: boolean;
  rawRowText: string;
}): ParsedLineItem => {
  const amount = new ExactDecimal(normalizeMoney(input.amount));
  const vat = new ExactDecimal(input.vat);
  return {
    lineNo: input.lineNo,
    description: normalizeSpaces(input.description),
    quantity: normalizeMoney(input.quantity),
    unitName: input.unitName,
    unitPrice: normalizeMoney(input.unitPrice),
    vatRate: input.vatRate,
    lineBaseAmount: (input.vatIncluded ? amount.minus(vat) : amount).toFixed(2),
    lineVatAmount: vat.toFixed(2),
    lineTotalAmount: (input.vatIncluded ? amount : amount.plus(vat)).toFixed(2),
    rawRowText: normalizeSpaces(input.rawRowText),
    sourceRowCode: null,
    serviceCode: null,
    itemTypeCode: null,
    unitCode: null,
    benefitCode: null,
    exciseAmount: null,
    countryCode: null,
    countryName: null,
    customsDeclarationNumber: null,
  };
};

const allocateFooterVat = (
  rows: RegExpMatchArray[],
  subtotal: string,
  vatAmount: string,
  vatRate: string | null,
  vatIncluded: boolean,
) => {
  // These layouts print VAT only in the footer. Allocate it proportionally,
  // retaining the footer's rounding on the final row only for complete tables.
  const rowSum = rows.reduce(
    (sum, row) => sum.plus(normalizeMoney(row[6] ?? "0")),
    new ExactDecimal(0),
  );
  const complete = rowSum.eq(subtotal);
  let allocatedVat = new ExactDecimal(0);
  const lineItems = rows.map((row, index) => {
    const amount = normalizeMoney(row[6] ?? "0");
    const vat =
      complete && index === rows.length - 1
        ? new ExactDecimal(vatAmount).minus(allocatedVat)
        : new ExactDecimal(amount)
            .times(vatAmount)
            .div(new ExactDecimal(subtotal).isZero() ? 1 : subtotal)
            .toDecimalPlaces(2);
    allocatedVat = allocatedVat.plus(vat);
    return lineItem({
      lineNo: Number(row[1]),
      description: row[2] ?? "",
      quantity: row[3] ?? "0",
      unitName: row[4] ?? "",
      unitPrice: row[5] ?? "0",
      amount,
      vatRate,
      vat: vat.toFixed(2),
      vatIncluded,
      rawRowText: row[0],
    });
  });
  return { lineItems, complete };
};

export const parseRuPaymentInvoice = (rawText: string): ParsedVatInvoice => {
  if (/Плательщик/iu.test(rawText) && !/Покупатель/iu.test(rawText))
    return parseRuLegacyInvoice(rawText);
  const text = normalizeSpaces(rawText);
  const headers = Array.from(text.matchAll(HEADER));
  if (headers.length !== 1) throw new InvoiceDocumentParseError("Expected one RU payment invoice");
  const header = headers[0];
  const supplierBlock = text.match(
    /Поставщик\s*(?:\(Исполнитель\))?\s*:\s*(.*?)\s+Покупатель/iu,
  )?.[1];
  const recipientBlock = text.match(
    /Покупатель\s*(?:\(Заказчик\))?\s*:\s*(.*?)\s+(?:Основание\s*:|№\s+Товары)/iu,
  )?.[1];
  const supplier = parseParty(required(supplierBlock, "supplier"));
  const recipient = parseParty(required(recipientBlock, "recipient"));
  const subtotal = required(text.match(new RegExp(`Итого:\\s*${MONEY}`, "iu"))?.[1], "subtotal");
  const totalAmount = normalizeMoney(
    required(text.match(new RegExp(`Всего к оплате:\\s*${MONEY}`, "iu"))?.[1], "totalAmount"),
  );
  const vatMatch = text.match(
    new RegExp(`(В том числе|Сумма)\\s+НДС\\s+(\\d+(?:[,.]\\d+)?)%:\\s*${MONEY}`, "iu"),
  );
  const withoutVat = /(?:Без\s+НДС|НДС\s+не\s+облагается)/iu.test(text);
  if (!vatMatch && !withoutVat) throw new InvoiceDocumentParseError("Field not found: VAT summary");
  const vatAmount = vatMatch?.[3] ? normalizeMoney(vatMatch[3]) : "0.00";
  const vatRate = vatMatch?.[2] ? normalizeMoney(vatMatch[2]) : null;
  const vatIncluded = /^В том числе/iu.test(vatMatch?.[1] ?? "");
  const baseAmount = (
    vatIncluded
      ? new ExactDecimal(totalAmount).minus(vatAmount)
      : new ExactDecimal(normalizeMoney(subtotal))
  ).toFixed(2);
  const table =
    text.match(
      /№\s+Товары\s*\(работы,\s*услуги\)\s+Кол-во\s+Ед\.\s+Цена\s+Сумма\s+(.*?)\s+Итого:/iu,
    )?.[1] ?? "";
  const rows = Array.from(
    table.matchAll(
      new RegExp(
        `(?:^|\\s)(\\d+)\\s+(.*?[^№\\s])\\s+(\\d+(?:\\s+\\d{3})*(?:[,.]\\d+)?)\\s+((?:10\\^3\\s+)?[\\p{L}.]+)\\s+${MONEY}\\s+${MONEY}(?=\\s+\\d+\\s+[\\p{L}«\"]|$)`,
        "giu",
      ),
    ),
  );
  const { lineItems, complete } = allocateFooterVat(
    rows,
    normalizeMoney(subtotal),
    vatAmount,
    vatRate,
    vatIncluded,
  );
  const expectedRows = Number(text.match(/Всего наименований\s+(\d+)/iu)?.[1] ?? lineItems.length);
  const amounts = { lineItems, baseAmount, vatAmount, totalAmount };
  return {
    documentType: /на\s+оплату/iu.test(header?.[0] ?? "") ? "Счет на оплату" : "Счет",
    documentNumber: required(header?.[1], "documentNumber"),
    documentDate: parseRuInvoiceDate(required(header?.[2], "documentDate")),
    supplier,
    recipient,
    ...amounts,
    rawText,
    reviewRequired:
      !supplier.name ||
      !recipient.name ||
      expectedRows !== lineItems.length ||
      !complete ||
      needsInvoiceReview(amounts),
  };
};

export const parseRuInvoiceXls = (buffer: Buffer): ParsedVatInvoice => {
  const workbook = XLSX.read(buffer, { type: "buffer", codepage: 1251 });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new InvoiceDocumentParseError("XLS workbook does not contain a sheet");
  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
    .map((row) => row.map((cell) => String(cell ?? "").trim()));
  const rawText = rows.map((row) => row.join(" ")).join("\n");
  const header = Array.from(rawText.matchAll(HEADER));
  if (header.length !== 1)
    throw new UnsupportedRuInvoiceXlsError("Unsupported RU XLS invoice header");
  const labelValue = (label: RegExp): string | undefined => {
    for (const row of rows) {
      const column = row.findIndex((cell) => label.test(cell));
      if (column >= 0) return row.slice(column + 1).find(Boolean);
    }
    return undefined;
  };
  const supplier = parseParty(required(labelValue(/^Поставщик\s*:/iu), "supplier"));
  const supplierIds = labelValue(/^ИНН\/КПП\s*:/iu)?.split("/");
  supplier.taxId = supplierIds?.[0] ?? null;
  supplier.kpp = supplierIds?.[1] ?? null;
  const recipient = parseParty(required(labelValue(/^Плательщик\s*:/iu), "recipient"));
  const tableStart = rows.findIndex((row) => row.includes("ПРЕДМЕТ СЧЕТА"));
  if (tableStart < 0) throw new InvoiceDocumentParseError("Unsupported RU XLS invoice table");
  const columns = (rows[tableStart] ?? []).flatMap((value, index) => (value ? [index] : []));
  const cells = rows.slice(tableStart + 1).map((row) => columns.map((column) => row[column] ?? ""));
  const lineItems: ParsedLineItem[] = [];
  for (const row of cells) {
    if (/^ИТОГО/iu.test(row[0] ?? "")) break;
    if (!/^\d+$/u.test(row[0] ?? "") || !/\p{L}/u.test(row[1] ?? "")) continue;
    lineItems.push(
      lineItem({
        lineNo: Number(row[0]),
        description: (row[1] ?? "").replace(/^\d+\s+/u, ""),
        unitName: row[2] ?? "",
        quantity: required(row[3], "quantity"),
        unitPrice: required(row[4], "unitPrice"),
        vatRate: row[5]?.replace("%", "") ?? null,
        vat: normalizeMoney(required(row[6], "lineVatAmount")),
        amount: required(row[7], "lineTotalAmount"),
        vatIncluded: true,
        rawRowText: row.join(" | "),
      }),
    );
  }
  const totals = cells.find((row) => /^ИТОГО/iu.test(row[0] ?? ""));
  const vatAmount = new ExactDecimal(normalizeMoney(required(totals?.[6], "vatAmount"))).toFixed(2);
  const totalAmount = new ExactDecimal(
    normalizeMoney(required(totals?.[7], "totalAmount")),
  ).toFixed(2);
  const baseAmount = new ExactDecimal(totalAmount).minus(vatAmount).toFixed(2);
  const amounts = { lineItems, vatAmount, totalAmount, baseAmount };
  return {
    documentType: "Счет",
    documentNumber: required(header[0]?.[1], "documentNumber"),
    documentDate: parseRuInvoiceDate(required(header[0]?.[2], "documentDate")),
    supplier,
    recipient,
    ...amounts,
    rawText,
    reviewRequired: needsInvoiceReview(amounts),
  };
};

// Older unit-first forms are often scans. Preserve readable fields, but require
// review: the OCR can omit whole rows even when the footer remains readable.
const parseRuLegacyInvoice = (rawText: string): ParsedVatInvoice => {
  const text = normalizeSpaces(rawText);
  const headers = Array.from(text.matchAll(HEADER));
  if (headers.length !== 1) throw new InvoiceDocumentParseError("Expected one RU payment invoice");
  const header = headers[0];
  const supplierName =
    text.match(/Продавец\s+(.*?)\s+Адрес/iu)?.[1] ?? text.split(/\s+Адрес\s*:/iu)[0];
  const supplier = parseParty(required(supplierName, "supplier"));
  const supplierRequisites = text.slice(0, header?.index);
  supplier.taxId =
    supplierRequisites.match(/ИНН\s*(\d{12}|\d{10})(?!\d)/iu)?.[1] ??
    supplierRequisites.match(/ИНН\/КПП\s*(\d{12}|\d{10})\//iu)?.[1] ??
    null;
  supplier.kpp =
    supplierRequisites.match(/КПП\s*(\d{9})(?!\d)/iu)?.[1] ??
    supplierRequisites.match(/ИНН\/КПП\s*\d+\/(\d{9})(?!\d)/iu)?.[1] ??
    null;
  const recipient = parseParty(
    required(
      text.match(/Плательщик\s*[:—-]?\s*(.*?)\s+(?:Грузополучатель|Адрес)/iu)?.[1],
      "recipient",
    ),
  );
  const money = "(\\d+(?:[ '\\u00a0]\\d{3})*[.,-]\\d{2})";
  const amount = (value: string | undefined, field: string) =>
    normalizeMoney(
      required(value, field)
        .replace(/'/gu, "")
        .replace(/-(\d{2})$/u, ".$1"),
    );
  const separatedTotals = text.match(
    new RegExp(`Итого:\\s*Итого НДС:\\s*Всего к оплате:\\s*${money}\\s+${money}\\s+${money}`, "iu"),
  );
  const columnTotals = text.match(
    new RegExp(`${money}\\s+${money}\\s+Всего\\s+[пn][оo]\\s+счету`, "iu"),
  );
  const vatAmount = amount(
    text.match(new RegExp(`Итого НДС:\\s*${money}`, "iu"))?.[1] ??
      separatedTotals?.[2] ??
      columnTotals?.[1],
    "vatAmount",
  );
  const totalAmount = amount(
    text.match(new RegExp(`Всего к оплате:\\s*${money}`, "iu"))?.[1] ??
      separatedTotals?.[3] ??
      columnTotals?.[2],
    "totalAmount",
  );
  const baseAmount = new ExactDecimal(totalAmount).minus(vatAmount).toFixed(2);
  const tableRows = Array.from(
    text.matchAll(
      new RegExp(
        `(?:^|\\s)(\\d+)\\s*\\|?\\s*(Печать.*?)\\s+(шт|экз)\\s+(\\d+(?:\\s+\\d{3})*)\\s+${money}\\s+${money}`,
        "giu",
      ),
    ),
  );
  // Reorder the unit-first columns into the same shape as the modern form.
  const orderedRows = tableRows.map(
    (row) =>
      [
        row[0],
        row[1],
        row[2],
        row[4],
        row[3],
        amount(row[5], "unitPrice"),
        amount(row[6], "lineTotalAmount"),
      ] as RegExpMatchArray,
  );
  const { lineItems } = allocateFooterVat(orderedRows, totalAmount, vatAmount, null, true);
  return {
    documentType: "Счет",
    documentNumber: required(header?.[1], "documentNumber"),
    documentDate: parseRuInvoiceDate(required(header?.[2], "documentDate")),
    supplier,
    recipient,
    baseAmount,
    vatAmount,
    totalAmount,
    lineItems,
    rawText,
    reviewRequired: true,
  };
};
