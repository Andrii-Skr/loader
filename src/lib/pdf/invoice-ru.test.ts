import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx/xlsx.js";

import { parseRuInvoiceXls } from "@/lib/pdf/invoice-ru";
import { detectAndParseDocument } from "@/lib/pdf/registry";

// Fictional examples of the supported layouts; no source documents or OCR data.
const invoice = ({
  number = "ТЕСТ-0000123",
  date = "12 мая 2031",
  rows = '1 Типографские работы по печати журнала "Демо" №12 (ф.А5, пол.64+4) (заказ 900) 5 700 экз 11,60 66 120,00',
  summary = "Итого: 66 120,00\nВ том числе НДС 22%: 11 923,28\nВсего к оплате: 66 120,00",
  count = 1,
} = {}) => `Банк получателя ИНН 3333333333 КПП 333333333
Счет на оплату № ${number} от ${date} г.
Поставщик
(Исполнитель):
ООО "Демо-печать", ИНН 1111111111, КПП 111111111, Адрес поставщика
Покупатель
(Заказчик):
ООО "Демо-пресса", ИНН 2222222222, КПП 222222222, Адрес покупателя
Основание: Договор № 99
№ Товары (работы, услуги) Кол-во Ед. Цена Сумма
${rows}
${summary}
Всего наименований ${count}, на сумму 66 120,00 руб.`;

const parse = (text: string) => detectAndParseDocument(text).parsed;

describe("RU payment invoices", () => {
  it("detects an ordinary RU invoice before the partial VAT-invoice markers", () => {
    const detected = detectAndParseDocument(invoice());
    expect(detected).toMatchObject({
      contour: "RU",
      documentTypeId: 2,
      parserVersion: "invoice-ru-pdf-v1",
      lookupLocale: "ru-RU",
    });
    expect(detected.parsed).toMatchObject({
      documentNumber: "ТЕСТ-0000123",
      documentDate: "12.05.2031",
      supplier: { name: 'ООО "Демо-печать"', taxId: "1111111111", kpp: "111111111" },
      recipient: { name: 'ООО "Демо-пресса"', taxId: "2222222222", kpp: "222222222" },
      baseAmount: "54196.72",
      vatAmount: "11923.28",
      totalAmount: "66120.00",
      reviewRequired: false,
    });
    expect(detected.parsed.lineItems[0]).toMatchObject({
      quantity: "5700",
      unitName: "экз",
      unitPrice: "11.60",
      vatRate: "22",
      lineBaseAmount: "54196.72",
      lineVatAmount: "11923.28",
      lineTotalAmount: "66120.00",
    });
    expect(
      detected.parsePublicationIssueDescription(
        detected.parsed.lineItems[0]?.description ?? "",
        detected.parsed.documentDate,
      ),
    ).toMatchObject({ publicationName: "Демо", canonicalIssueNumber: "12-31" });
  });

  it("parses VAT added on top, fractional quantities and thousand-copy units", () => {
    const parsed = parse(
      invoice({
        rows: '1 Газета "Демо" № 15 9,9 10^3 экз 2 950,00 29 205,00',
        summary: "Итого: 29 205,00 Сумма НДС 22%: 6 425,10 Всего к оплате: 35 630,10",
      }),
    );
    expect(parsed).toMatchObject({
      baseAmount: "29205.00",
      vatAmount: "6425.10",
      totalAmount: "35630.10",
      reviewRequired: false,
    });
    expect(parsed.lineItems[0]).toMatchObject({
      quantity: "9.9",
      description: 'Газета "Демо" № 15',
      unitName: "10^3 экз",
      lineBaseAmount: "29205.00",
      lineVatAmount: "6425.10",
      lineTotalAmount: "35630.10",
    });
  });

  it("keeps wrapped rows and reconciles VAT rounding across multiple rows", () => {
    const parsed = parse(
      invoice({
        count: 3,
        rows: "1 Журнал «Демо»\n№17/1 Спецвыпуск «Весна» 1 шт 1,00 1,00\n2 Журнал «Демо» №17/2 1 шт 1,00 1,00\n3 Журнал «Демо» №17/3 1 шт 1,00 1,00",
        summary: "Итого: 3,00 В том числе НДС 22%: 0,54 Всего к оплате: 3,00",
      }),
    );
    expect(parsed.lineItems.map((line) => line.lineVatAmount)).toEqual(["0.18", "0.18", "0.18"]);
    expect(parsed.lineItems[0]?.description).toBe("Журнал «Демо» №17/1 Спецвыпуск «Весна»");
    expect(parsed.reviewRequired).toBe(false);
  });

  it("supports invoices without VAT and numeric dates", () => {
    expect(
      parse(
        invoice({
          date: "12.05.2031",
          summary: "Итого: 66 120,00 Без НДС Всего к оплате: 66 120,00",
        }),
      ),
    ).toMatchObject({
      documentDate: "12.05.2031",
      baseAmount: "66120.00",
      vatAmount: "0.00",
      reviewRequired: false,
    });
  });

  it("flags missing rows, a mismatched total and missing tables", () => {
    expect(parse(invoice({ count: 2 })).reviewRequired).toBe(true);
    expect(
      parse(invoice().replace("Всего к оплате: 66 120,00", "Всего к оплате: 66 121,00"))
        .reviewRequired,
    ).toBe(true);
    expect(parse(invoice({ rows: "unreadable row" })).reviewRequired).toBe(true);
  });

  it("does not allocate all footer VAT to an incomplete table", () => {
    const parsed = parse(
      invoice({
        rows: '1 Газета "Демо" № 1 1 шт 10,00 10,00',
        count: 2,
        summary: "Итого: 20,00 Сумма НДС 22%: 4,40 Всего к оплате: 24,40",
      }),
    );
    expect(parsed.reviewRequired).toBe(true);
    expect(parsed.lineItems[0]?.lineVatAmount).toBe("2.20");
  });

  it("rejects invalid dates and missing VAT summaries", () => {
    expect(() => parse(invoice({ date: "31 февраля 2031" }))).toThrow("invalidDocumentDate");
    expect(() => parse(invoice({ summary: "Итого: 66 120,00 Всего к оплате: 66 120,00" }))).toThrow(
      "VAT summary",
    );
  });

  it("rejects multiple invoices instead of silently saving only the first", () => {
    expect(() => parse(`${invoice()}\n${invoice({ number: "2" })}`)).toThrow(
      expect.objectContaining({ code: "multipleInvoicesInFile" }),
    );
    expect(() =>
      parse(
        "Предварительный счет NQ123 Дата 01.05.2031\nПредварительный счет N2124 Дата 02.05.2031",
      ),
    ).toThrow(expect.objectContaining({ code: "multipleInvoicesInFile" }));
  });
});

const spreadsheet = (missingQuantity = false) => {
  const rows = [
    ["Поставщик :", 'ООО "Демо-печать"'],
    ["ИНН/КПП :", "1111111111/111111111"],
    ["Счет №", "9000", "от", "27 апреля 2031 г."],
    ["Плательщик:", 'ООО "Демо-пресса", ИНН 2222222222, КПП 222222222'],
    [
      "№ п/п",
      "ПРЕДМЕТ СЧЕТА",
      "Ед. изм.",
      "Коли- чество",
      "Цена",
      "Ставка НДС",
      "Сумма НДС",
      "Сумма руб. коп.",
    ],
    [1, 2, 3, 4, 5, 6, 7, 8],
    [1, '500 Журнал "Демо-сказки" №6', "шт", missingQuantity ? "" : 100, 10, "22%", 220, 1220],
    [2, '501 Журнал "Демо-игры" №6', "шт", 200, 10, "22%", 440, 2440],
    ["ИТОГО:", "", "", "", "", "", 660, 3660],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => row.flatMap((cell) => ["", cell, ""])));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Счет");
  return XLSX.write(workbook, { type: "buffer", bookType: "biff8" }) as Buffer;
};

describe("RU XLS invoices", () => {
  it("reads CP1251 cells, skips numbering headers and preserves explicit row VAT", () => {
    const parsed = parseRuInvoiceXls(spreadsheet());
    expect(parsed).toMatchObject({
      documentNumber: "9000",
      documentDate: "27.04.2031",
      baseAmount: "3000.00",
      vatAmount: "660.00",
      totalAmount: "3660.00",
      reviewRequired: false,
    });
    expect(parsed.supplier).toEqual({
      name: 'ООО "Демо-печать"',
      taxId: "1111111111",
      kpp: "111111111",
    });
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      description: 'Журнал "Демо-сказки" №6',
      quantity: "100",
      unitPrice: "10",
      lineBaseAmount: "1000.00",
      lineVatAmount: "220.00",
      lineTotalAmount: "1220.00",
    });
  });

  it("does not shift later columns into a missing quantity cell", () => {
    expect(() => parseRuInvoiceXls(spreadsheet(true))).toThrow("quantity");
  });
});

describe("older scanned RU invoice layouts", () => {
  it("preserves legible unit-first rows and requires review when OCR loses rows", () => {
    const parsed = parse(`ООО "Демо-печать"
Адрес: Адрес поставщика
ИНН 1111111111 КПП 111111111
СЧЕТ Мо 9020 от 7 Апреля 2031 г.
Плательщик: ООО "Демо-пресса"
Грузополучатель: ООО "Демо-пресса"
№ Наименование товара Единица измерения Количество Цена Сумма
1|Печать "Демо" №9 шт 100 12-20 1220-00
2 unreadable row
Итого: 3660-00 Итого НДС: 660-00 Всего к оплате: 3660-00
Всего наименований 2`);
    expect(parsed).toMatchObject({
      documentNumber: "9020",
      documentDate: "07.04.2031",
      baseAmount: "3000.00",
      vatAmount: "660.00",
      totalAmount: "3660.00",
      reviewRequired: true,
    });
    expect(parsed.lineItems[0]).toMatchObject({
      quantity: "100",
      unitPrice: "12.20",
      lineBaseAmount: "1000.00",
      lineVatAmount: "220.00",
      lineTotalAmount: "1220.00",
    });
    expect(parsed.supplier.taxId).toBe("1111111111");
    expect(parsed.recipient.taxId).toBeNull();
  });

  it("never assigns buyer tax IDs to the seller in the legacy form", () => {
    const parsed = parse(`Продавец ООО "Демо-печать" Адрес поставщика
ИНН/КПП 1111111111/111111111
Счет № 9021 от 2 июня 2031 г.
Плательщик ООО "Демо-пресса", ИНН 2222222222, КПП 222222222
Адрес покупателя
660.00 3660.00 Всего no счету:`);
    expect(parsed.supplier).toMatchObject({ taxId: "1111111111", kpp: "111111111" });
    expect(parsed.recipient).toMatchObject({ taxId: "2222222222", kpp: "222222222" });
    expect(parsed.lineItems).toEqual([]);
    expect(parsed.reviewRequired).toBe(true);
  });
});
