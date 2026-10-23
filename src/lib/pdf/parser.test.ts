// Invoice examples below use fictional counterparties, identifiers and order amounts.
import { describe, expect, it } from "vitest";

import { parseUaInvoiceDocument } from "@/lib/pdf/invoice-document-parser";
import {
  canonicalizeIssueNumber,
  detectAndParseDocument,
  detectAndParseInvoice,
  detectVatInvoiceRuV1,
  detectVatInvoiceUaV1,
  parsePublicationIssueDescription,
  parsePublicationIssueDescriptionRuV1,
  parseVatInvoiceRuV1,
  parseVatInvoiceUaV1,
} from "@/lib/pdf/parser";

const sampleText = `Зведена податкова накладна
Податкова накладна 1 0 0 4 2 0 2 6 1 8 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ДЕМО-ПРІНТ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 14 400,00 ІІ Загальна сума податку на додану вартість, у тому числі: 2 400,00 ІІІ загальна сума податку на додану вартість за основною ставкою 2 400,00 VI Усього обсяги постачання за основною ставкою (код ставки 20) 12 000,00 VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 Послуга друку газети "Тестові задачі. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 2400 2,50 20 6 000,00 1 200,00 2 Послуга друку газети "Тестові задачі. Спецвипуск" (р) №5-26 (саморобки) 18.12 шт 2009 2400 2,50 20 6 000,00 1 200,00
Суми податку на додану вартість, нараховані (сплачені)`;

const sampleRuText = `Универсальный передаточный документ Статус: 1
1 – счет-фактура и передаточный документ (акт)
2 – передаточный документ (акт)
Счет-фактура № 9010 от 24 апреля 2026 г.
Исправление № --- от ---
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Документ об отгрузке: УПД, № 9010 от 24.04.2026 (5а)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
Код товара/ работ, услуг
№ п/п
Наименование товара (описание выполненных работ, оказанных услуг), имущественного права
Код вида товара
Единица измерения
Количество (объем)
Цена (тариф) за единицу измерения
Стоимость товаров (работ,услуг), имущественных прав без налога - всего
В том числе сумма акциза
Налого-вая ставка
Сумма налога, предъявляемая покупателю
Стоимость товаров (работ, услуг), имущественных прав с налогом - всего
Страна происхож-дения товара
Регистрационный номер декларации на товары или регистрационный номер партии товара, подлежащего прослеживаемости
код условное обозначе-ние (нацио-нальное)
Цифро-вой код
Краткое наимено-вание
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 0278 Журнал "Тестовые сказки" №5 - 796 шт 1200 10.25 12 300.00 без акциза 22% 2 706.00 15 006.00 - - -
- 2 0279 Журнал "Демо истории" №5 - 796 шт 1800 8.00 14 400.00 без акциза 22% 3 168.00 17 568.00 - - -
Всего к оплате 26 700.00 Х 5 874.00 32 574.00`;

describe("invoice parser registry", () => {
  it("detects UA invoices", () => {
    expect(detectVatInvoiceUaV1(sampleText)).toBeGreaterThan(0);
    expect(detectAndParseInvoice(sampleText).contour).toBe("UA");
  });

  it("detects RU invoices", () => {
    expect(detectVatInvoiceRuV1(sampleRuText)).toBeGreaterThan(0);
    expect(detectAndParseInvoice(sampleRuText).contour).toBe("RU");
  });

  it("fails on unknown invoice contour", () => {
    expect(() => detectAndParseInvoice("just a random text file")).toThrow(
      /supported invoice contour/i,
    );
  });

  it("parses a regular invoice that mentions value-added tax", () => {
    const text = `Рахунок № 1 від 1 січня 2026 р.
Постачальник: ТОВ Альфа
Покупець: ТОВ Бета
№ Найменування робіт, послуг
1 Газета № 1 1 шт 10,00 10,00
Всього: 10,00
Всього з ПДВ: 12,00
Сума податку на додану вартість: 2,00`;

    expect(detectVatInvoiceUaV1(text)).toBe(0);
    expect(detectAndParseDocument(text)).toMatchObject({
      documentTypeId: 2,
      parsed: { documentNumber: "1" },
    });
  });

  it("parses a regular invoice whose line mentions a tax invoice number", () => {
    const text = `Рахунок № 1 від 1 січня 2026 р.
Постачальник: ТОВ Альфа
Покупець: ТОВ Бета
№ Найменування робіт, послуг
1 Оформлення Податкова накладна 123 1 шт 10,00 10,00
Всього: 10,00
Всього з ПДВ: 12,00
Сума податку на додану вартість: 2,00`;

    expect(detectVatInvoiceUaV1(text)).toBe(0);
    expect(detectAndParseDocument(text)).toMatchObject({
      documentTypeId: 2,
      parsed: { documentNumber: "1" },
    });
  });
});

describe("parseUaInvoiceDocument", () => {
  it.each([
    { quantity: "750", expected: "750", base: "2 610,00", vat: "522,00", total: "3 132,00" },
    { quantity: "1 850", expected: "1850", base: "6 438,00", vat: "1 287,60", total: "7 725,60" },
    {
      quantity: "10 000",
      expected: "10000",
      base: "34 800,00",
      vat: "6 960,00",
      total: "41 760,00",
    },
    { quantity: "1,5", expected: "1.5", base: "5,22", vat: "1,04", total: "6,26" },
  ])(
    "keeps the issue number separate from quantity $quantity",
    ({ quantity, expected, base, vat, total }) => {
      const detected =
        detectAndParseDocument(`Рахунок на оплату по замовленню № 9017 від 18 серпня 2026 р.
Постачальник: ТОВ Демо-Друк
Покупець: ТОВ Демо
Договір: № ДЕМО
№ Код Товар Кількість Ціна без
ПДВ
Сума без
ПДВ
1 000000001 друк газети "Демо газета" № 9 ${quantity} шт 3,48000 ${base}
Разом: ${base}
Сума ПДВ: ${vat}
Всього із ПДВ: ${total}`);
      const { parsed } = detected;

      expect(parsed.lineItems).toHaveLength(1);
      expect(parsed.lineItems[0]).toMatchObject({
        description: 'друк газети "Демо газета" № 9',
        quantity: expected,
        unitName: "шт",
        unitPrice: "3.48000",
        lineBaseAmount: base.replace(/ /g, "").replace(",", "."),
      });
      expect(
        detected.parsePublicationIssueDescription(
          parsed.lineItems[0]?.description ?? "",
          parsed.documentDate,
        ),
      ).toEqual({
        publicationName: "Демо газета",
        rawIssueNumber: "9",
        canonicalIssueNumber: "09-26",
      });
      expect(parsed.reviewRequired).toBe(false);
    },
  );

  it("preserves the calendar error when detecting a regular invoice", () => {
    const text = `Рахунок № 1 від 31 квітня 2026 р.
Постачальник: ТОВ Альфа
Покупець: ТОВ Бета
№ Найменування робіт, послуг
1 Друк журналу №1 1 шт 10,00 10,00
Всього: 10,00
Всього з ПДВ: 12,00
Сума податку на додану вартість: 2,00`;
    expect(() => detectAndParseDocument(text)).toThrow("invalidDocumentDate");
  });
  it("extracts act counterparties and tax IDs from their requisites", () => {
    const parsed = parseUaInvoiceDocument(`АКТ надання послуг № 9016 від 30 квітня 2026 р.
Ми, що нижче підписалися, представник Замовника ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО" Директор Тестовий Представник Замовника, з одного боку, і представник Виконавця ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ДЕМО-ПРІНТ" Тестовий Представник Виконавця, ген.директор, з іншого боку.
№ Найменування робіт, послуг Кіл-сть Од. Ціна без ПДВ Сума без ПДВ
1 Послуга друку газети "Демо журнал" № 5 1 850 шт 3,0000000000 3 600,00
Всього: 3 600,00
Сума ПДВ: 720,00
Всього із ПДВ: 4 320,00
Від Виконавця Від Замовника
ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ДЕМО-ПРІНТ", код за ЄДРПОУ 11111111, ІПН 111111111111, п/р UA000000000000000000000000000
ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО", код за ЄДРПОУ 22222222, ІПН 222222222222, п/р UA000000000000000000000000000`);

    expect(parsed.supplier).toMatchObject({
      name: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ДЕМО-ПРІНТ"',
      taxId: "111111111111",
    });
    expect(parsed.recipient).toMatchObject({
      name: 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО"',
      taxId: "222222222222",
    });
    expect(parsed.lineItems).toHaveLength(1);
  });
});

describe("parseVatInvoiceRuV1", () => {
  it("rejects an impossible Russian invoice date", () => {
    expect(() =>
      parseVatInvoiceRuV1(sampleRuText.replace("24 апреля 2026", "31 апреля 2026")),
    ).toThrow("invalidDocumentDate");
  });
  it("extracts header and line items", () => {
    const parsed = parseVatInvoiceRuV1(sampleRuText);

    expect(parsed.documentType).toBe("Счет-фактура");
    expect(parsed.documentNumber).toBe("9010");
    expect(parsed.documentDate).toBe("24.04.2026");
    expect(parsed.supplier.name).toBe(
      'Общество с ограниченной ответственностью "Тестовая типография"',
    );
    expect(parsed.supplier.taxId).toBe("1111111111");
    expect(parsed.supplier.kpp).toBe("111111111");
    expect(parsed.recipient.name).toBe('ООО Издательский дом "Тестовая пресса"');
    expect(parsed.recipient.taxId).toBe("2222222222");
    expect(parsed.recipient.kpp).toBe("222222222");
    expect(parsed.totalAmount).toBe("32574.00");
    expect(parsed.vatAmount).toBe("5874.00");
    expect(parsed.baseAmount).toBe("26700.00");
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: null,
      serviceCode: "0278",
      description: 'Журнал "Тестовые сказки" №5',
      itemTypeCode: null,
      unitCode: "796",
      unitName: "шт",
      quantity: "1200",
      unitPrice: "10.25",
      lineBaseAmount: "12300.00",
      exciseAmount: null,
      vatRate: "22%",
      lineVatAmount: "2706.00",
      lineTotalAmount: "15006.00",
      countryCode: null,
      countryName: null,
      customsDeclarationNumber: null,
    });
    expect(parsed.lineItems[1]).toMatchObject({
      lineNo: 2,
      sourceRowCode: null,
      serviceCode: "0279",
      description: 'Журнал "Демо истории" №5',
      unitCode: "796",
      unitName: "шт",
      quantity: "1800",
      unitPrice: "8.00",
      lineBaseAmount: "14400.00",
      lineVatAmount: "3168.00",
      lineTotalAmount: "17568.00",
    });
  });

  it("stores the first RU column as sourceRowCode when present", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 9011 от 9 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
БП-00001001 1 Газета "Тестовые новости. События дня" № 16 - 979 103 экз 7 1 250.00 8 750.00 без акциза 22% 1 925.00 10 675.00 - -
Всего к оплате 8 750.00 Х 1 925.00 10 675.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: "БП-00001001",
      serviceCode: null,
      description: 'Газета "Тестовые новости. События дня" № 16',
      itemTypeCode: "979",
      unitCode: "103",
      unitName: "экз",
      quantity: "7",
      unitPrice: "1250.00",
      lineBaseAmount: "8750.00",
      lineVatAmount: "1925.00",
      lineTotalAmount: "10675.00",
    });
  });

  it("extracts all RU rows when source row codes are present", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 9012 от 1 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
БП-00001002 1 Типографские работы по печати газеты "Сканворды. Демо" №13 (16 А4, 4+1) (заказ 7001) - 902 экз 2400.00 3.50 8 400.00 без акциза 22% 1 848.00 10 248.00 - - -
БП-00001002 2 Типографские работы по печати газеты "Сканворды. Демо" №14 (16 А4, 4+1) (заказ 7002) - 902 экз 2400.00 3.50 8 400.00 без акциза 22% 1 848.00 10 248.00 - - -
Всего к оплате 16 800.00 Х 3 696.00 20 496.00`);

    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: "БП-00001002",
      serviceCode: null,
      description:
        'Типографские работы по печати газеты "Сканворды. Демо" №13 (16 А4, 4+1) (заказ 7001)',
      unitCode: "902",
      unitName: "экз",
      quantity: "2400.00",
    });
    expect(parsed.lineItems[1]).toMatchObject({
      lineNo: 2,
      sourceRowCode: "БП-00001002",
    });
  });

  it("extracts RU rows without a service code before the description", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 9013 от 7 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 Тестовая серия. Сканворды № 5 - 796 шт 1600 6.00 9 600.00 без акциза 22% 2 112.00 11 712.00 - - -
- 2 Демо сканворды" № 5 - 796 шт 1600 6.00 9 600.00 без акциза 22% 2 112.00 11 712.00 - - -
- 3 Тестовые сканворды" № 5 - 796 шт 2400 8.00 19 200.00 без акциза 22% 4 224.00 23 424.00 - - -
- 4 Учебные сканворды № 8 - 796 шт 4000 12.00 48 000.00 без акциза 22% 10 560.00 58 560.00 - - -
Всего к оплате 86 400.00 Х 19 008.00 105 408.00`);

    expect(parsed.lineItems).toHaveLength(4);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: null,
      serviceCode: null,
      description: "Тестовая серия. Сканворды № 5",
    });
    expect(parsed.lineItems[3]).toMatchObject({
      lineNo: 4,
      lineTotalAmount: "58560.00",
    });
  });

  it("keeps issue digits attached to RU descriptions without a space before the issue marker", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 9014 от 7 февраля 2026 г.
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 Печать"Демо и друзья"№ 3 - 796 шт 1000 10.00 10 000.00 без акциза 22% 2 200.00 12 200.00 - - -
Всего к оплате 10 000.00 Х 2 200.00 12 200.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      description: 'Печать"Демо и друзья"№ 3',
      itemTypeCode: null,
    });
    expect(
      parsePublicationIssueDescriptionRuV1(parsed.lineItems[0]?.description ?? "", "07.02.2026"),
    ).toEqual({
      publicationName: "Демо и друзья",
      rawIssueNumber: "3",
      canonicalIssueNumber: "03-26",
    });
  });

  it("normalizes broken inner quotes in RU publication titles", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 9015 от 27 марта 2026 г.
Продавец Общество с ограниченной ответственностью "Тестовая типография" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 1111111111/111111111 (2б)
Покупатель ООО Издательский дом "Тестовая пресса" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 Печать "Тестовый сборник"Кейворды№ 3 - 796 шт 1000 10.00 10 000.00 без акциза 22% 2 200.00 12 200.00 - - -
Всего к оплате 10 000.00 Х 2 200.00 12 200.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      description: 'Печать "Тестовый сборник"Кейворды№ 3',
      itemTypeCode: null,
    });
    expect(
      parsePublicationIssueDescriptionRuV1(parsed.lineItems[0]?.description ?? "", "27.03.2026"),
    ).toEqual({
      publicationName: "Тестовый сборник Кейворды",
      rawIssueNumber: "3",
      canonicalIssueNumber: "03-26",
    });
  });

  it("extracts an alphanumeric RU invoice number from UPD headers", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № ТЕСТ-00001003 от 23 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "ТИПОГРАФСКИЙ КОМПЛЕКС "ПРИМЕР" (2)
Адрес Тестовый адрес продавца (2а)
ИНН/КПП продавца 3333333333/333333333 (2б)
Покупатель ООО "ИД "ТЕСТОВАЯ ПРЕССА" (6)
Адрес Тестовый адрес покупателя (6а)
ИНН/КПП покупателя 2222222222/222222222 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
Т000000001 1 Полиграфические работы по печати Журнала «Демо истории» №6/1 Спецвыпуск «Тестовый календарь» - 796 шт 2500.000 25.00 62 500.00 без акциза 22% 13 750.00 76 250.00 - - -
Всего к оплате 62 500.00 Х 13 750.00 76 250.00`);

    expect(parsed.documentType).toBe("Счет-фактура");
    expect(parsed.documentNumber).toBe("ТЕСТ-00001003");
    expect(parsed.documentDate).toBe("23.04.2026");
    expect(parsed.supplier.taxId).toBe("3333333333");
    expect(parsed.recipient.taxId).toBe("2222222222");
    expect(parsed.lineItems).toHaveLength(1);
  });
});

describe("parseVatInvoiceUaV1", () => {
  it.each([
    ["987654321098111111111876543210987222222221", "987654321098", "876543210987"],
    ["987654321098876543210987222222221", "987654321098", "876543210987"],
    ["987654321098876543210987", "987654321098", "876543210987"],
  ])("extracts arbitrary tax IDs from flattened form cells", (digits, supplier, recipient) => {
    const text = sampleText.replace(
      /\n[\d ]+\nРозділ А/u,
      `\n${digits.split("").join(" ")}\nРозділ А`,
    );
    const parsed = parseVatInvoiceUaV1(text);
    expect(parsed.supplier.taxId).toBe(supplier);
    expect(parsed.recipient.taxId).toBe(recipient);
  });
  it("does not guess identities when tax cells are incomplete", () => {
    const text = sampleText.replace(/\n[\d ]+\nРозділ А/u, "\n1 2 3\nРозділ А");
    expect(() => parseVatInvoiceUaV1(text)).toThrow("Supplier or recipient tax id not found");
  });
  it("requires review when OCR damages one of two table rows", () => {
    const start = sampleText.lastIndexOf("шт 2009 2400 2,50");
    const corrupted = sampleText.slice(0, start) + sampleText.slice(start).replace("2400", "2I00");
    const parsed = parseVatInvoiceUaV1(corrupted);
    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.reviewRequired).toBe(true);
    expect(parseVatInvoiceUaV1(sampleText).reviewRequired).toBe(false);
  });
  it("rejects an impossible date", () => {
    expect(() =>
      parseVatInvoiceUaV1(sampleText.replace("1 0 0 4 2 0 2 6", "3 1 0 2 2 0 2 6")),
    ).toThrow("invalidDocumentDate");
  });
  it("extracts header and line items", () => {
    const parsed = parseVatInvoiceUaV1(sampleText);

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.documentDate).toBe("10.04.2026");
    expect(parsed.documentNumber).toBe("18");
    expect(parsed.supplier.name).toContain("ДЕМО-ПРІНТ");
    expect(parsed.recipient.name).toBe('"ДЕМО"');
    expect(parsed.supplier.taxId).toBe("111111111111");
    expect(parsed.recipient.taxId).toBe("222222222222");
    expect(parsed.totalAmount).toBe("14400.00");
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      serviceCode: "18.12",
      unitName: "шт",
      unitCode: "2009",
      quantity: "2400",
      unitPrice: "2.50",
      vatRate: "20",
      lineBaseAmount: "6000.00",
      lineVatAmount: "1200.00",
    });
  });

  it("extracts supplier and recipient when names are laid out in two columns", () => {
    const realLayoutText = `Постачальник (продавець) Отримувач (покупець)
ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ДЕМО-ПРІНТ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 14 400,00
ІІ Загальна сума податку на додану вартість, у тому числі: 2 400,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 12 000,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 Послуга друку газети "Тестові задачі. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 2400 2,50 20 6 000,00 1 200,00
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 1 0 0 4 2 0 2 6 1 8 /\n(дата складання) (порядковий номер)\n${realLayoutText}`,
    );

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.supplier.name).toBe('"ДЕМО-ПРІНТ"');
    expect(parsed.recipient.name).toBe('"ДЕМО"');
    expect(parsed.supplier.taxId).toBe("111111111111");
    expect(parsed.recipient.taxId).toBe("222222222222");
  });

  it("extracts supplier and recipient when counterparties are on separate lines", () => {
    const lineSeparatedText = `Постачальник (продавець) Отримувач (покупець)
ТОВ "ДРУКАРНЯ 21"
ПРИВАТНЕ ПІДПРИЄМСТВО "АЛЬФА"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; prізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 14 400,00
ІІ Загальна сума податку на додану вартість, у тому числі: 2 400,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 12 000,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 Послуга друку газети "Тестові задачі. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 2400 2,50 20 6 000,00 1 200,00
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 0 9 0 4 2 0 2 6 2 7 /\n(дата складання) (порядковий номер)\n${lineSeparatedText}`,
    );

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.documentNumber).toBe("27");
    expect(parsed.documentDate).toBe("09.04.2026");
    expect(parsed.supplier.name).toBe('ТОВ "ДРУКАРНЯ 21"');
    expect(parsed.recipient.name).toBe('"АЛЬФА"');
  });

  it("extracts parties when recipient legal form is mixed-case or OCR-degraded", () => {
    const ocrLayoutText = `Постачальник (продавець) Отримувач (покупець) ПРИВАТНЕ ПІДПРИЄМСТВО "ТЕСТОВА ДРУКАРНЯ" Товаристо з обмеженою відповідальністю "Видавництво "Демо" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 3 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 14 400,00
ІІ Загальна сума податку на додану вартість, у тому числі: 2 400,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 12 000,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 друк газети "Демо головоломки" № 4 18.11 шт 2009 1250,125 8,00 20 10 001,00 2000,20
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 1 5 0 4 2 0 2 6 2 7 /\n(дата складання) (порядковий номер)\n${ocrLayoutText}`,
    );

    expect(parsed.supplier.name).toBe('"ТЕСТОВА ДРУКАРНЯ"');
    expect(parsed.recipient.name).toBe('"Демо"');
  });

  it("extracts line items when description does not start with 'Послуга'", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 1 5 0 4 2 0 2 6 1 1 1 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ТЕСТ-ПОЛІГРАФ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 12 001,20
ІІ Загальна сума податку на додану вартість, у тому числі: 2000,20
ІІІ загальна сума податку на додану вартість за основною ставкою 2000,20
VI Усього обсяги постачання за основною ставкою (код ставки 20) 10 001,00
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б Код Одиниця виміру Ціна постачання одиниці Обсяги постачання Сума ознака товару товару / послуги товару / послуги або Код Код пільги8 (база оподаткуван- податку на № з/п Опис (номенклатура) товарів/послуг товару згідно з ім- власна послуги згідно з умовне Кількість максимальна роздрібна ставки ня) без урахування додану продавця УКТ ЗЕД порт6 сільсько- Державним позначення код (об'єм, обсяг) ціна товарів без податку на додану вартість госпо- класифікатором (українське) урахування податку на вартість дарська продукції та додану вартість продук- послуг ція7 1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 друк газети "Демо головоломки" № 4 18.11 шт 2009 1250,125 8,00 20 10 001,00 2000,20
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      description: 'друк газети "Демо головоломки" № 4',
      serviceCode: "18.11",
      unitName: "шт",
      unitCode: "2009",
      quantity: "1250.125",
      unitPrice: "8.00",
      vatRate: "20",
      lineBaseAmount: "10001.00",
      lineVatAmount: "2000.20",
    });
  });

  it("extracts line items when unit code is missing", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 0 3 0 4 2 0 2 6 3 2 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ТЕСТ-ПОЛІГРАФ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "ДЕМО" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 384,00
ІІ Загальна сума податку на додану вартість, у тому числі: 64,00
ІІІ загальна сума податку на додану вартість за основною ставкою 64,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 320,00
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б Код Одиниця виміру Ціна постачання одиниці Обсяги постачання Сума ознака товару товару / послуги товару / послуги або Код Код пільги8 (база оподаткуван- податку на № з/п Опис (номенклатура) товарів/послуг товару згідно з ім- власна послуги згідно з умовне Кількість максимальна роздрібна ставки ня) без урахування додану продавця УКТ ЗЕД порт6 сільсько- Державним позначення код (об'єм, обсяг) ціна товарів без податку на додану вартість госпо- класифікатором (українське) урахування податку на вартість дарська продукції та додану вартість продук- послуг ція7 1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 Послуги з пакування 82.92 посл. 800 0,40 20 320,00 64,00
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      description: "Послуги з пакування",
      serviceCode: "82.92",
      unitName: "посл.",
      unitCode: null,
      quantity: "800",
      unitPrice: "0.40",
      vatRate: "20",
      lineBaseAmount: "320.00",
      lineVatAmount: "64.00",
    });
  });

  it("extracts all six line items when VAT amounts use three decimal places", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 0 9 0 4 2 0 2 6 2 7 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець)
ПРИВАТНЕ ПІДПРИЄМСТВО "ТЕСТОВА ДРУКАРНЯ"
Товариство з обмеженою відповідальністю "АЛЬФА"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 3 3 3 3 3 3 3 3 3 3 3 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 30 542,02
ІІ Загальна сума податку на додану вартість, у тому числі: 5 090,34
VI Усього обсяги постачання за основною ставкою (код ставки 20) 25 451,68
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 ж-л " Демо журнал.Судоку"*48 стр №4 А4 /укр 4902 тис.прим 1755 1,25 2 400,00 20 3 000,00 600,00
2 ж-л "Тестовий збірник "*144 стр №4 4902 тис.прим 1755 0,875 4 800,00 20 4 200,00 840,00
3 ж-л "Тестові задачі.Спецвипуск №4/саморобка/ *64 стр /укр 4902 тис.прим 1755 1,125 1 800,75 20 2 025,84 405,168
4 ж-л "Тестові задачі.Спецвипуск №5/саморобка/ *64 стр /укр 4902 тис.прим 1755 1,125 1 800,75 20 2 025,84 405,168
5 ж-л "Демо хвиля " *48 стр №8 А4 /укр 4902 тис.прим 1755 2,375 3 200,00 20 7 600,00 1 520,000
6 ж-л "Демо хвиля.Судоку "*48стр №7 А4 / укр 4902 тис.прим 1755 1,65 4 000,00 20 6 600,00 1 320,00
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(6);
    expect(parsed.lineItems.map((item) => item.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parsed.lineItems[2]).toMatchObject({
      lineNo: 3,
      serviceCode: "4902",
      unitName: "тис.прим",
      unitCode: "1755",
      quantity: "1.125",
      unitPrice: "1800.75",
      vatRate: "20",
      lineBaseAmount: "2025.84",
      lineVatAmount: "405.168",
    });
    expect(parsed.lineItems[5]).toMatchObject({
      lineNo: 6,
      description: 'ж-л "Демо хвиля.Судоку "*48стр №7 А4 / укр',
      lineVatAmount: "1320.00",
    });
  });
});

describe("parsePublicationIssueDescription", () => {
  const documentDate = "23.04.2026";

  it("extracts publication and issue from a journal description with technical suffixes", () => {
    expect(
      parsePublicationIssueDescription(
        'ж-л " 1000 тестів Кейворди " ( R )*96 стр №4 А4',
        documentDate,
      ),
    ).toEqual({
      publicationName: "1000 тестів Кейворди (R)",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("keeps issue text with slash suffix", () => {
    expect(
      parsePublicationIssueDescription(
        'ж-л "Тестові задачі.Спецвипуск №4/саморобка/ *64 стр /укр',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Тестові задачі.Спецвипуск",
      rawIssueNumber: "4 (саморобка)",
      canonicalIssueNumber: "04-26 (саморобка)",
    });
  });

  it("removes A4/ukr technical suffixes from the issue number", () => {
    expect(
      parsePublicationIssueDescription('ж-л "Тестові задачі" №5 А4/укр/', documentDate),
    ).toEqual({
      publicationName: "Тестові задачі",
      rawIssueNumber: "5",
      canonicalIssueNumber: "05-26",
    });
  });

  it("parses RU publication descriptions independently", () => {
    expect(
      parsePublicationIssueDescriptionRuV1('Журнал "Сканворды" №4 /рус/', documentDate),
    ).toEqual({
      publicationName: "Сканворды",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("removes RU technical print annotations and order markers from the issue number", () => {
    expect(
      parsePublicationIssueDescriptionRuV1(
        'Типографские работы по печати журнала "Любимая Теща. Кейворды" №10-26 (ф.А5, пол.64+4,обл.4+4, вн.блок 1+1) (заказ 526)',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Любимая Тёща. Кейворды",
      rawIssueNumber: "10-26",
      canonicalIssueNumber: "10-26",
    });

    expect(
      parsePublicationIssueDescriptionRuV1(
        'Типографские работы по печати журнала "Любимая Теща. Кейворды" №16-26 (16 А4, 4+1) (заказ 541)',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Любимая Тёща. Кейворды",
      rawIssueNumber: "16-26",
      canonicalIssueNumber: "16-26",
    });
  });

  it("normalizes yo in RU publication titles", () => {
    expect(parsePublicationIssueDescriptionRuV1("Любимая Теща. Филворды №4", documentDate)).toEqual(
      {
        publicationName: "Любимая Тёща. Филворды",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    );
  });

  it("strips the RU publication prefix for edition labels", () => {
    expect(
      parsePublicationIssueDescriptionRuV1('Издание "Истинное здоровье №7', documentDate),
    ).toEqual({
      publicationName: "Истинное здоровье",
      rawIssueNumber: "7",
      canonicalIssueNumber: "07-26",
    });
  });

  it("strips the RU print prefix", () => {
    expect(
      parsePublicationIssueDescriptionRuV1('Печать "Любимая Тёща. Кейворды" №10-26', documentDate),
    ).toEqual({
      publicationName: "Любимая Тёща. Кейворды",
      rawIssueNumber: "10-26",
      canonicalIssueNumber: "10-26",
    });
  });

  it("strips the RU print prefix without a space before quotes", () => {
    expect(parsePublicationIssueDescriptionRuV1('Печать"Демо и друзья"№ 3', documentDate)).toEqual({
      publicationName: "Демо и друзья",
      rawIssueNumber: "3",
      canonicalIssueNumber: "03-26",
    });
  });

  it("removes dangling quote tails and parses bracketed RU issue markers", () => {
    expect(
      parsePublicationIssueDescriptionRuV1("Газета «Копейка. ТВ программа» (№13)", documentDate),
    ).toEqual({
      publicationName: "Копейка. ТВ программа",
      rawIssueNumber: "13",
      canonicalIssueNumber: "13-26",
    });
  });

  it("keeps issue text with bracketed suffix", () => {
    expect(
      parsePublicationIssueDescription(
        'Послуга друку газети "Тестові задачі. Спецвипуск" (р) №4-26 (саморобки)',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Тестові задачі. Спецвипуск (р)",
      rawIssueNumber: "4-26 (саморобки)",
      canonicalIssueNumber: "04-26 (саморобки)",
    });
  });

  it("keeps a named special-issue suffix and appends the tax year", () => {
    expect(
      parsePublicationIssueDescription(
        'ж-л "Кейворди.Спецвипуск №4 (Ключвордія)" *64 стр А5',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Кейворди.Спецвипуск",
      rawIssueNumber: "4 (Ключвордія)",
      canonicalIssueNumber: "04-26 (Ключвордія)",
    });
  });

  it("returns null when description does not contain an issue marker", () => {
    expect(parsePublicationIssueDescription("Послуги з пакування", documentDate)).toBeNull();
  });

  it("removes trailing slash garbage from the publication name", () => {
    expect(parsePublicationIssueDescription('ж-л "Моя кума / тут / № 4', documentDate)).toEqual({
      publicationName: "Моя кума",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("removes a dangling trailing slash from the publication name", () => {
    expect(parsePublicationIssueDescription('ж-л "Моя кума/ № 4', documentDate)).toEqual({
      publicationName: "Моя кума",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("preserves a meaningful /R/ suffix as part of the publication", () => {
    expect(parsePublicationIssueDescription('ж-л "Тестові задачі" /R/ № 4', documentDate)).toEqual({
      publicationName: "Тестові задачі (R)",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("removes embedded star-page tokens before a trailing marker", () => {
    expect(
      parsePublicationIssueDescription('ж-л "Демо головоломки *80 стр (R) № 4', documentDate),
    ).toEqual({
      publicationName: "Демо головоломки (R)",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("canonicalizes slash issue numbers with the invoice year", () => {
    expect(canonicalizeIssueNumber("4/2", documentDate)).toBe("04/2-26");
    expect(canonicalizeIssueNumber("4/2 (саморобка)", documentDate)).toBe("04/2-26 (саморобка)");
  });

  it("keeps an explicit year suffix from the issue itself", () => {
    expect(canonicalizeIssueNumber("4-25", documentDate)).toBe("04-25");
  });

  it.each([
    {
      description: 'ж-л "Тестові задачі" №5 А4/укр/',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №5 А5',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" /R/ №5',
      expected: {
        publicationName: "Тестові задачі (R)",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "1000 тестів.Сканворди" ( R ) №12',
      expected: {
        publicationName: "1000 тестів.Сканворди (R)",
        rawIssueNumber: "12",
        canonicalIssueNumber: "12-26",
      },
    },
    {
      description: 'ж-л "Моя кума/" №4',
      expected: {
        publicationName: "Моя кума",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №5 /укр/',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №4-26 ( саморобки)',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "4-26 (саморобки)",
        canonicalIssueNumber: "04-26 (саморобки)",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №4/саморобка/',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "4 (саморобка)",
        canonicalIssueNumber: "04-26 (саморобка)",
      },
    },
    {
      description: 'послуга з друку газети "Демо журнал. Спецвипуск" №4',
      expected: {
        publicationName: "Демо журнал. Спецвипуск",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №5/укр/В4',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №4 В4',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №4/2, спецвипуск',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "4/2",
        canonicalIssueNumber: "04/2-26",
      },
    },
    {
      description: 'ж-л "Тестові задачі" №4, спецвипуск',
      expected: {
        publicationName: "Тестові задачі",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Кейворди"*64 стр А5 /укр/ №9',
      expected: {
        publicationName: "Кейворди",
        rawIssueNumber: "9",
        canonicalIssueNumber: "09-26",
      },
    },
    {
      description: 'ж-л " Суцвіття сканвордів"(R)*32 стор №4 В4',
      expected: {
        publicationName: "Суцвіття сканвордів (R)",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Суцвіття сканвордів" 32 стор №4',
      expected: {
        publicationName: "Суцвіття сканвордів",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
  ])("normalizes publication/issue variants: $description", ({ description, expected }) => {
    expect(parsePublicationIssueDescription(description, documentDate)).toEqual(expected);
  });
});
