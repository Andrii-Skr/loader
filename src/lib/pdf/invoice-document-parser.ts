// The package entry point selects the ESM build in Turbopack. That build
// decodes legacy CP1251 XLS strings incorrectly, so use SheetJS' Node/CJS
// build explicitly for server-side invoice parsing.
import * as XLSX from "xlsx/xlsx.js";

import { canonicalizeIssueNumber, parsePublicationIssueDescriptionUaV1 } from "@/lib/pdf/parser-ua";
import { normalizeMoney, normalizeSpaces } from "@/lib/pdf/shared";
import type { ParsedLineItem, ParsedVatInvoice } from "@/lib/pdf/types";

export class InvoiceDocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvoiceDocumentParseError";
  }
}

const UA_MONTHS: Record<string, string> = {
  січня: "01",
  лютого: "02",
  березня: "03",
  квітня: "04",
  травня: "05",
  червня: "06",
  липня: "07",
  серпня: "08",
  вересня: "09",
  жовтня: "10",
  листопада: "11",
  грудня: "12",
};

const emptyLineItem = (input: {
  lineNo: number;
  description: string;
  quantity: string;
  unitName: string | null;
  unitPrice: string;
  lineBaseAmount: string;
}): ParsedLineItem => ({
  lineNo: input.lineNo,
  description: normalizeSpaces(input.description),
  sourceRowCode: null,
  serviceCode: null,
  itemTypeCode: null,
  unitName: input.unitName,
  unitCode: null,
  quantity: normalizeMoney(input.quantity),
  unitPrice: normalizeMoney(input.unitPrice),
  vatRate: "20",
  benefitCode: null,
  lineBaseAmount: normalizeMoney(input.lineBaseAmount),
  lineVatAmount: "0",
  exciseAmount: null,
  lineTotalAmount: null,
  countryCode: null,
  countryName: null,
  customsDeclarationNumber: null,
  rawRowText: "",
});

const parseUaDate = (value: string): string => {
  const normalized = normalizeSpaces(value).replace(/р\.?$/u, "").trim();
  const match = normalized.match(/(\d{1,2})\s+([а-яіїєґ]+)\s+(\d{4})/iu);
  const month = match?.[2] ? UA_MONTHS[match[2].toLocaleLowerCase("uk-UA")] : null;

  if (!match?.[1] || !match[3] || !month) {
    throw new InvoiceDocumentParseError("Field not found: documentDate");
  }

  return `${match[1].padStart(2, "0")}.${month}.${match[3]}`;
};

const findTaxId = (value: string): string | null =>
  value.match(/ІПН\s*(\d{10,12})/iu)?.[1] ??
  value.match(/(?:ЄДРПОУ|Код)\s*(?:за\s+ЄДРПОУ\s*)?(\d{8,12})/iu)?.[1] ??
  null;

const findParty = (text: string, labels: string[], endLabels: string[]) => {
  const label = labels.find((item) => text.includes(item));

  if (!label) {
    return { name: "", taxId: null };
  }

  const start = text.indexOf(label) + label.length;
  const after = text.slice(start);
  const endIndexes = endLabels
    .map((endLabel) => after.indexOf(endLabel))
    .filter((index) => index >= 0);
  const block = after.slice(0, endIndexes.length > 0 ? Math.min(...endIndexes) : 900);
  const name = normalizeSpaces(block.split(/(?:п\/р|р\/р|код за|ІПН|Договір:|Тел\.:)/iu)[0] ?? "");

  return { name, taxId: findTaxId(block) };
};

const parseActFooterParties = (
  text: string,
): {
  supplier: { name: string; taxId: string | null };
  recipient: { name: string; taxId: string | null };
} | null => {
  const parties: Array<{ name: string; taxId: string | null }> = [];
  const legalEntityMarker = /ТОВАРИСТВО\s+З\s+ОБМЕЖЕНОЮ\s+ВІДПОВІДАЛЬНІСТЮ/giu;
  const legalEntityMatches = Array.from(text.matchAll(legalEntityMarker));

  for (const [index, match] of legalEntityMatches.entries()) {
    if (match.index === undefined) continue;

    const nextMatchIndex = legalEntityMatches[index + 1]?.index;
    const nearbyText = text.slice(
      match.index,
      Math.min(match.index + 500, nextMatchIndex ?? Number.POSITIVE_INFINITY),
    );
    const requisitesMarker = nearbyText.search(/,\s*код\s+за\s+ЄДРПОУ\s+\d{8,12}/iu);

    if (requisitesMarker < 0) continue;

    const name = normalizeSpaces(nearbyText.slice(0, requisitesMarker));
    const taxId = findTaxId(nearbyText.slice(requisitesMarker));

    if (name && taxId) {
      parties.push({ name, taxId });
    }
  }

  if (parties.length < 2) return null;

  const [supplier, recipient] = parties;
  return supplier && recipient ? { supplier, recipient } : null;
};

const parseInvoiceLines = (text: string): ParsedLineItem[] => {
  const tableStart =
    [
      text.indexOf("№ Товари (роботи, послуги)"),
      text.indexOf("№ Номер замовлення Дата замовлення Товари"),
      text.indexOf("№ Код Товар"),
      text.indexOf("№ Найменування робіт, послуг"),
    ]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0] ?? -1;
  const body = tableStart >= 0 ? text.slice(tableStart) : text;
  const end = body.search(/(?:Всього:|Разом:|Всього\s+з\s+ПДВ|Сума\s+ПДВ)/iu);
  const table = (end >= 0 ? body.slice(0, end) : body).replace(/\r/g, " ");
  if (/Номер замовлення Дата замовлення/iu.test(table)) {
    return Array.from(
      table.matchAll(
        /(\d+)\s+\d+\s+\d{2}\.\d{2}\.\d{4}\s+(.*?)\s+(\d+(?:,\d+)?)\s+(тис\.прим)\s*([0-9\s]+,\d{2,10})\s+([0-9\s]+,\d{2})/giu,
      ),
    ).map((match) => {
      const [, lineNo, description, quantity, unitName, unitPrice, lineBaseAmount] = match;
      return {
        ...emptyLineItem({
          lineNo: Number(lineNo),
          description: description ?? "",
          quantity: quantity ?? "0",
          unitName: unitName ?? null,
          unitPrice: unitPrice ?? "0",
          lineBaseAmount: lineBaseAmount ?? "0",
        }),
        rawRowText: normalizeSpaces(match[0]),
      };
    });
  }

  const matches = Array.from(
    table.matchAll(
      /(?:^|\s)(\d+)\s+(.*?)(\d+(?:\s+\d+)?)\s+([\p{L}.]+)\s+(\d[\d\s]*[,.]\d{2,10})\s+(\d[\d\s]*[,.]\d{2})/gisu,
    ),
  );

  return matches.map((match) => {
    const [, lineNo, rawDescription, quantity, unitName, unitPrice, lineBaseAmount] = match;
    const description = (rawDescription ?? "").replace(/^\d{5,}\s+/u, "").trim();

    return {
      ...emptyLineItem({
        lineNo: Number(lineNo),
        description,
        quantity: quantity ?? "0",
        unitName: unitName ?? null,
        unitPrice: unitPrice ?? "0",
        lineBaseAmount: lineBaseAmount ?? "0",
      }),
      rawRowText: normalizeSpaces(match[0]),
    };
  });
};

const parseTotal = (text: string, label: RegExp): string | null => {
  const match = text.match(label);
  return match?.[1] ? normalizeMoney(match[1]) : null;
};

export const parseUaInvoiceDocument = (rawText: string): ParsedVatInvoice => {
  const text = rawText.replace(/\r/g, "");
  const header = text.match(
    /((?:Рахунок(?:-фактура)?(?:\s+на\s+оплату)?(?:\s+по\s+замовленню)?|Акт\s+(?:про\s+)?надання\s+послуг))\s*№\s*([\p{L}\d./-]+)\s+від\s+(\d{1,2}\s+[а-яіїєґ]+\s+\d{4}\s*р?\.?)/iu,
  );

  if (!header?.[1] || !header[2] || !header[3]) {
    throw new InvoiceDocumentParseError("Field not found: invoice document header");
  }

  const isServiceAct = /^Акт\s+(?:про\s+)?надання\s+послуг/iu.test(header[1]);
  const actParties = isServiceAct ? parseActFooterParties(text) : null;
  let supplier =
    actParties?.supplier ??
    findParty(text, ["Постачальник:", "Виконавець:"], ["Покупець:", "Замовник:", "Договір:"]);
  let recipient =
    actParties?.recipient ??
    findParty(text, ["Покупець:", "Замовник:"], ["Договір:", "№ Товари", "№ Найменування"]);
  if (!supplier.name) {
    const match = text.match(
      /представник Виконавця\s+(.+?)\s+(?:Генеральний\s+директор|Директор)/iu,
    );
    supplier = { name: normalizeSpaces(match?.[1] ?? ""), taxId: null };
  }

  if (!recipient.name) {
    const match = text.match(/представник Замовника\s+(.+?)\s+Директор/iu);
    recipient = { name: normalizeSpaces(match?.[1] ?? ""), taxId: null };
  }

  const lineItems = parseInvoiceLines(text);
  const baseAmount = parseTotal(text, /(?:Всього:|Разом:|Разом без ПДВ:)\s*([0-9\s]+[,.]\d{2})/iu);
  const vatAmount = parseTotal(text, /Сума\s+ПДВ:\s*([0-9\s]+[,.]\d{2})/iu);
  const totalAmount =
    parseTotal(text, /(?:Всього\s+(?:із|з)\s+ПДВ|Усього\s+з\s+ПДВ):\s*([0-9\s]+[,.]\d{2})/iu) ??
    baseAmount;

  if (!supplier.name || !recipient.name || !baseAmount || !totalAmount) {
    throw new InvoiceDocumentParseError("Field not found: invoice parties or total");
  }

  return {
    documentType: normalizeSpaces(header[1]),
    documentNumber: normalizeSpaces(header[2]),
    documentDate: parseUaDate(header[3]),
    supplier: { name: supplier.name, taxId: supplier.taxId, kpp: null },
    recipient: { name: recipient.name, taxId: recipient.taxId, kpp: null },
    totalAmount,
    vatAmount,
    baseAmount,
    lineItems,
    rawText,
    reviewRequired: lineItems.length === 0,
  };
};

const getString = (row: unknown[], index: number): string => String(row[index] ?? "").trim();

export const parseLandpressXls = (buffer: Buffer): ParsedVatInvoice => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellText: true,
    cellDates: false,
    codepage: 1251,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];

  if (!sheet) {
    throw new InvoiceDocumentParseError("XLS workbook does not contain a sheet");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const text = rows.map((row) => row.map((cell) => String(cell ?? "")).join(" ")).join("\n");
  const header = text.match(
    /Рахунок-фактура\s*№\s*([\p{L}\d./-]+)[\s\S]*?від\s+(\d{1,2}\s+[а-яіїєґ]+\s+\d{4}\s*р?\.?)/iu,
  );
  const tableHeaderIndex = rows.findIndex(
    (row) => getString(row, 0) === "№" && /Назва|Товари|Найменування/iu.test(getString(row, 1)),
  );

  if (!header?.[1] || !header[2] || tableHeaderIndex === -1) {
    throw new InvoiceDocumentParseError("Unsupported XLS invoice layout");
  }

  const lineItems: ParsedLineItem[] = [];
  for (const row of rows.slice(tableHeaderIndex + 1)) {
    const lineNo = Number(getString(row, 0));
    if (!Number.isInteger(lineNo) || lineNo <= 0) {
      if (lineItems.length > 0) break;
      continue;
    }

    lineItems.push({
      ...emptyLineItem({
        lineNo,
        description: getString(row, 1),
        quantity: getString(row, 6),
        unitName: getString(row, 5) || null,
        unitPrice: getString(row, 7),
        lineBaseAmount: getString(row, 8),
      }),
      serviceCode: getString(row, 4) || null,
      rawRowText: row.map((cell) => String(cell ?? "")).join(" | "),
    });
  }

  const supplierName = getString(rows[0] ?? [], 2);
  const recipientRow = rows.find((row) => getString(row, 1) === "Одержувач");
  const recipientName = getString(recipientRow ?? [], 2);
  const baseAmount = parseTotal(text, /Разом\s+без\s+ПДВ:\s*([0-9\s]+(?:[,.]\d{1,2})?)/iu);
  const vatAmount = parseTotal(text, /(?:^|\n)\s*ПДВ:\s*([0-9\s]+(?:[,.]\d{1,2})?)/imu);
  const totalAmount = parseTotal(text, /Всього\s+з\s+ПДВ:\s*([0-9\s]+(?:[,.]\d{1,2})?)/iu);

  if (!supplierName || !recipientName || !baseAmount || !totalAmount) {
    throw new InvoiceDocumentParseError("Field not found: XLS invoice parties or total");
  }

  return {
    documentType: "Рахунок-фактура",
    documentNumber: normalizeSpaces(header[1]),
    documentDate: parseUaDate(header[2]),
    supplier: { name: supplierName, taxId: findTaxId(text.slice(0, 800)), kpp: null },
    recipient: { name: recipientName, taxId: findTaxId(recipientName), kpp: null },
    totalAmount,
    vatAmount,
    baseAmount,
    lineItems,
    rawText: text,
    reviewRequired: lineItems.length === 0,
  };
};

export const getInvoicePublicationIssue = (description: string, documentDate: string) =>
  parsePublicationIssueDescriptionUaV1(description, documentDate);

export { canonicalizeIssueNumber };
