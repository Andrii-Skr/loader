import { describe, expect, it } from "vitest";

import {
  canonicalizeIssueNumber,
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
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ПОЛІПРІНТ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 2 1 0 8 2 5 2 6 5 4 8 3 2 1 0 8 2 5 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 37 800,00 ІІ Загальна сума податку на додану вартість, у тому числі: 6 300,00 ІІІ загальна сума податку на додану вартість за основною ставкою 6 300,00 VI Усього обсяги постачання за основною ставкою (код ставки 20) 31 500,00 VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 Послуга друку газети "Філворди. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 3150 5,00 20 15 750,00 3 150,00 2 Послуга друку газети "Філворди. Спецвипуск" (р) №5-26 (саморобки) 18.12 шт 2009 3150 5,00 20 15 750,00 3 150,00
Суми податку на додану вартість, нараховані (сплачені)`;

const sampleRuText = `Универсальный передаточный документ Статус: 1
1 – счет-фактура и передаточный документ (акт)
2 – передаточный документ (акт)
Счет-фактура № 035 от 24 апреля 2026 г.
Исправление № --- от ---
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край, г.Краснодар, ул.Зиповская (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Документ об отгрузке: УПД, № 035 от 24.04.2026 (5а)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецкая Народная Республика, г. Донецк г.о. Донецк, ул. Батищева, д. 10А (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
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
- 1 0278 Журнал "В гостях у доброй сказки" №5 - 796 шт 3300 38.02 125 459.02 без акциза 22% 27 600.98 153 060.00 - - -
- 2 0279 Журнал "Карамельки" №5 - 796 шт 2850 45.15 128 670.49 без акциза 22% 28 307.51 156 978.00 - - -
Всего к оплате 254 129.51 Х 55 908.49 310 038.00`;

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
});

describe("parseVatInvoiceRuV1", () => {
  it("extracts header and line items", () => {
    const parsed = parseVatInvoiceRuV1(sampleRuText);

    expect(parsed.documentType).toBe("Счет-фактура");
    expect(parsed.documentNumber).toBe("035");
    expect(parsed.documentDate).toBe("24.04.2026");
    expect(parsed.supplier.name).toBe('Общество с ограниченной ответственностью "Кубаньпечать"');
    expect(parsed.supplier.taxId).toBe("2310044604");
    expect(parsed.supplier.kpp).toBe("231001001");
    expect(parsed.recipient.name).toBe('ООО Издательский дом "Семейная пресса"');
    expect(parsed.recipient.taxId).toBe("9309026071");
    expect(parsed.recipient.kpp).toBe("930901001");
    expect(parsed.totalAmount).toBe("310038.00");
    expect(parsed.vatAmount).toBe("55908.49");
    expect(parsed.baseAmount).toBe("254129.51");
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: null,
      serviceCode: "0278",
      description: 'Журнал "В гостях у доброй сказки" №5',
      itemTypeCode: null,
      unitCode: "796",
      unitName: "шт",
      quantity: "3300",
      unitPrice: "38.02",
      lineBaseAmount: "125459.02",
      exciseAmount: null,
      vatRate: "22%",
      lineVatAmount: "27600.98",
      lineTotalAmount: "153060.00",
      countryCode: null,
      countryName: null,
      customsDeclarationNumber: null,
    });
    expect(parsed.lineItems[1]).toMatchObject({
      lineNo: 2,
      sourceRowCode: null,
      serviceCode: "0279",
      description: 'Журнал "Карамельки" №5',
      unitCode: "796",
      unitName: "шт",
      quantity: "2850",
      unitPrice: "45.15",
      lineBaseAmount: "128670.49",
      lineVatAmount: "28307.51",
      lineTotalAmount: "156978.00",
    });
  });

  it("stores the first RU column as sourceRowCode when present", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 706 от 9 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
БП-00006405 1 Газета "Итоги и факты. События недели" № 16 - 979 103 экз 10 2 950.00 29 500.00 без акциза 22% 6 490.00 35 990.00 - -
Всего к оплате 29 500.00 Х 6 490.00 35 990.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: "БП-00006405",
      serviceCode: null,
      description: 'Газета "Итоги и факты. События недели" № 16',
      itemTypeCode: "979",
      unitCode: "103",
      unitName: "экз",
      quantity: "10",
      unitPrice: "2950.00",
      lineBaseAmount: "29500.00",
      lineVatAmount: "6490.00",
      lineTotalAmount: "35990.00",
    });
  });

  it("extracts all RU rows when source row codes are present", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 628 от 1 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
БП-00002441 1 Типографские работы по печати газеты "Сканворды. Копейка" №13 (16 А4, 4+1) (заказ 452) - 902 экз 4400.00 3.03 13 344.26 без акциза 22% 2 935.74 16 280.00 - - -
БП-00002441 2 Типографские работы по печати газеты "Сканворды. Копейка" №14 (16 А4, 4+1) (заказ 453) - 902 экз 4400.00 3.03 13 344.26 без акциза 22% 2 935.74 16 280.00 - - -
Всего к оплате 26 688.52 Х 5 871.48 32 560.00`);

    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: "БП-00002441",
      serviceCode: null,
      description:
        'Типографские работы по печати газеты "Сканворды. Копейка" №13 (16 А4, 4+1) (заказ 452)',
      unitCode: "902",
      unitName: "экз",
      quantity: "4400.00",
    });
    expect(parsed.lineItems[1]).toMatchObject({
      lineNo: 2,
      sourceRowCode: "БП-00002441",
    });
  });

  it("extracts RU rows without a service code before the description", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 988 от 7 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 По-крупному. Соцветие сканвордов № 5 - 796 шт 2800 14.70 41 150.82 без акциза 22% 9 053.18 50 204.00 - - -
- 2 Соцветие сканвордов" № 5 - 796 шт 2800 14.70 41 150.82 без акциза 22% 9 053.18 50 204.00 - - -
- 3 Царство сканвордов" № 5 - 796 шт 4250 16.64 70 717.21 без акциза 22% 15 557.79 86 275.00 - - -
- 4 Любимая ярмарка сканвордов № 8 - 796 шт 12000 16.68 200 163.93 без акциза 22% 44 036.07 244 200.00 - - -
Всего к оплате 353 182.78 Х 77 700.22 430 883.00`);

    expect(parsed.lineItems).toHaveLength(4);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      sourceRowCode: null,
      serviceCode: null,
      description: "По-крупному. Соцветие сканвордов № 5",
    });
    expect(parsed.lineItems[3]).toMatchObject({
      lineNo: 4,
      lineTotalAmount: "244200.00",
    });
  });

  it("keeps issue digits attached to RU descriptions without a space before the issue marker", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 511 от 7 февраля 2026 г.
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 Печать"Кузя и друзья"№ 3 - 796 шт 1000 10.00 10 000.00 без акциза 22% 2 200.00 12 200.00 - - -
Всего к оплате 10 000.00 Х 2 200.00 12 200.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      description: 'Печать"Кузя и друзья"№ 3',
      itemTypeCode: null,
    });
    expect(
      parsePublicationIssueDescriptionRuV1(parsed.lineItems[0]?.description ?? "", "07.02.2026"),
    ).toEqual({
      publicationName: "Кузя и друзья",
      rawIssueNumber: "3",
      canonicalIssueNumber: "03-26",
    });
  });

  it("normalizes broken inner quotes in RU publication titles", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № 1228 от 27 марта 2026 г.
Продавец Общество с ограниченной ответственностью "Кубаньпечать" (2)
Адрес 350010, Краснодарский край (2а)
ИНН/КПП продавца 2310044604/231001001 (2б)
Покупатель ООО Издательский дом "Семейная пресса" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
- 1 Печать "Толстый зять"Кейворды№ 3 - 796 шт 1000 10.00 10 000.00 без акциза 22% 2 200.00 12 200.00 - - -
Всего к оплате 10 000.00 Х 2 200.00 12 200.00`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      description: 'Печать "Толстый зять"Кейворды№ 3',
      itemTypeCode: null,
    });
    expect(
      parsePublicationIssueDescriptionRuV1(parsed.lineItems[0]?.description ?? "", "27.03.2026"),
    ).toEqual({
      publicationName: "Толстый зять Кейворды",
      rawIssueNumber: "3",
      canonicalIssueNumber: "03-26",
    });
  });

  it("extracts an alphanumeric RU invoice number from UPD headers", () => {
    const parsed = parseVatInvoiceRuV1(`Универсальный передаточный документ Статус: 1
Счет-фактура № ДБ-004230001 от 23 апреля 2026 г.
Продавец Общество с ограниченной ответственностью "ТИПОГРАФСКИЙ КОМПЛЕКС "ДЕВИЗ" (2)
Адрес 190020, Город Санкт-Петербург (2а)
ИНН/КПП продавца 7801159356/783801001 (2б)
Покупатель ООО "ИД "СЕМЕЙНАЯ ПРЕССА" (6)
Адрес Донецк (6а)
ИНН/КПП покупателя 9309026071/930901001 (6б)
А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11
У000027486 1 Полиграфические работы по печати Журнала «Карамельки» №6/1 Спецвыпуск «Календарь для школьника» - 796 шт 5000.000 26.23 131 147.54 без акциза 22% 28 852.46 160 000.00 - - -
Всего к оплате 131 147.54 Х 28 852.46 160 000.00`);

    expect(parsed.documentType).toBe("Счет-фактура");
    expect(parsed.documentNumber).toBe("ДБ-004230001");
    expect(parsed.documentDate).toBe("23.04.2026");
    expect(parsed.supplier.taxId).toBe("7801159356");
    expect(parsed.recipient.taxId).toBe("9309026071");
    expect(parsed.lineItems).toHaveLength(1);
  });
});

describe("parseVatInvoiceUaV1", () => {
  it("extracts header and line items", () => {
    const parsed = parseVatInvoiceUaV1(sampleText);

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.documentDate).toBe("10.04.2026");
    expect(parsed.documentNumber).toBe("18");
    expect(parsed.supplier.name).toContain("ПОЛІПРІНТ");
    expect(parsed.recipient.name).toBe(
      'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ"',
    );
    expect(parsed.supplier.taxId).toBe("321082526548");
    expect(parsed.recipient.taxId).toBe("431696926542");
    expect(parsed.totalAmount).toBe("37800.00");
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      serviceCode: "18.12",
      unitName: "шт",
      unitCode: "2009",
      quantity: "3150",
      unitPrice: "5.00",
      vatRate: "20",
      lineBaseAmount: "15750.00",
      lineVatAmount: "3150.00",
    });
  });

  it("extracts supplier and recipient when names are laid out in two columns", () => {
    const realLayoutText = `Постачальник (продавець) Отримувач (покупець)
ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ПОЛІПРІНТ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 2 1 0 8 2 5 2 6 5 4 8 3 2 1 0 8 2 5 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 37 800,00
ІІ Загальна сума податку на додану вартість, у тому числі: 6 300,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 31 500,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 Послуга друку газети "Філворди. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 3150 5,00 20 15 750,00 3 150,00
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 1 0 0 4 2 0 2 6 1 8 /\n(дата складання) (порядковий номер)\n${realLayoutText}`,
    );

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.supplier.name).toBe('ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ПОЛІПРІНТ"');
    expect(parsed.recipient.name).toBe(
      'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ"',
    );
    expect(parsed.supplier.taxId).toBe("321082526548");
    expect(parsed.recipient.taxId).toBe("431696926542");
  });

  it("extracts supplier and recipient when counterparties are on separate lines", () => {
    const lineSeparatedText = `Постачальник (продавець) Отримувач (покупець)
ТОВ "ДРУКАРНЯ 21"
ПРИВАТНЕ ПІДПРИЄМСТВО "АЛЬФА"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; prізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 2 1 0 8 2 5 2 6 5 4 8 3 2 1 0 8 2 5 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 37 800,00
ІІ Загальна сума податку на додану вартість, у тому числі: 6 300,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 31 500,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 Послуга друку газети "Філворди. Спецвипуск" (р) №4-26 (саморобки) 18.12 шт 2009 3150 5,00 20 15 750,00 3 150,00
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 0 9 0 4 2 0 2 6 2 7 /\n(дата складання) (порядковий номер)\n${lineSeparatedText}`,
    );

    expect(parsed.documentType).toBe("Податкова накладна");
    expect(parsed.documentNumber).toBe("27");
    expect(parsed.documentDate).toBe("09.04.2026");
    expect(parsed.supplier.name).toBe('ТОВ "ДРУКАРНЯ 21"');
    expect(parsed.recipient.name).toBe('ПРИВАТНЕ ПІДПРИЄМСТВО "АЛЬФА"');
  });

  it("extracts parties when recipient legal form is mixed-case or OCR-degraded", () => {
    const ocrLayoutText = `Постачальник (продавець) Отримувач (покупець) ПРИВАТНЕ ПІДПРИЄМСТВО "ВОЛИНСЬКА ДРУКАРНЯ" Товаристо з обмеженою відповідальністю "Видавництво "Кузя" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
4 3 7 6 2 4 1 0 3 0 8 7 4 3 7 6 2 4 1 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 37 800,00
ІІ Загальна сума податку на додану вартість, у тому числі: 6 300,00
VI Усього обсяги постачання за основною ставкою (код ставки 20) 31 500,00
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 друк газети "Тещині млинці" № 4 18.11 шт 2009 1612,418 2,73 20 4 401,90 880,38
Суми податку на додану вартість, нараховані (сплачені)`;

    const parsed = parseVatInvoiceUaV1(
      `Податкова накладна 1 5 0 4 2 0 2 6 2 7 /\n(дата складання) (порядковий номер)\n${ocrLayoutText}`,
    );

    expect(parsed.supplier.name).toBe('ПРИВАТНЕ ПІДПРИЄМСТВО "ВОЛИНСЬКА ДРУКАРНЯ"');
    expect(parsed.recipient.name).toBe(
      'Товаристо з обмеженою відповідальністю "Видавництво "Кузя"',
    );
  });

  it("extracts line items when description does not start with 'Послуга'", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 1 5 0 4 2 0 2 6 1 1 1 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "МЕГА-ПОЛІГРАФ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 2 1 0 8 2 5 2 6 5 4 8 3 2 1 0 8 2 5 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 5 282,28
ІІ Загальна сума податку на додану вартість, у тому числі: 880,38
ІІІ загальна сума податку на додану вартість за основною ставкою 880,38
VI Усього обсяги постачання за основною ставкою (код ставки 20) 4 401,90
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б Код Одиниця виміру Ціна постачання одиниці Обсяги постачання Сума ознака товару товару / послуги товару / послуги або Код Код пільги8 (база оподаткуван- податку на № з/п Опис (номенклатура) товарів/послуг товару згідно з ім- власна послуги згідно з умовне Кількість максимальна роздрібна ставки ня) без урахування додану продавця УКТ ЗЕД порт6 сільсько- Державним позначення код (об'єм, обсяг) ціна товарів без податку на додану вартість госпо- класифікатором (українське) урахування податку на вартість дарська продукції та додану вартість продук- послуг ція7 1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 друк газети "Тещині млинці" № 4 18.11 шт 2009 1612,418 2,73 20 4 401,90 880,38
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      description: 'друк газети "Тещині млинці" № 4',
      serviceCode: "18.11",
      unitName: "шт",
      unitCode: "2009",
      quantity: "1612.418",
      unitPrice: "2.73",
      vatRate: "20",
      lineBaseAmount: "4401.90",
      lineVatAmount: "880.38",
    });
  });

  it("extracts line items when unit code is missing", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 0 3 0 4 2 0 2 6 3 2 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець) ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "МЕГА-ПОЛІГРАФ" ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ВИДАВНИЦТВО "КУЗЯ" (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
3 2 1 0 8 2 5 2 6 5 4 8 3 2 1 0 8 2 5 9 1 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 1 197,00
ІІ Загальна сума податку на додану вартість, у тому числі: 199,50
ІІІ загальна сума податку на додану вартість за основною ставкою 199,50
VI Усього обсяги постачання за основною ставкою (код ставки 20) 997,50
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б Код Одиниця виміру Ціна постачання одиниці Обсяги постачання Сума ознака товару товару / послуги товару / послуги або Код Код пільги8 (база оподаткуван- податку на № з/п Опис (номенклатура) товарів/послуг товару згідно з ім- власна послуги згідно з умовне Кількість максимальна роздрібна ставки ня) без урахування додану продавця УКТ ЗЕД порт6 сільсько- Державним позначення код (об'єм, обсяг) ціна товарів без податку на додану вартість госпо- класифікатором (українське) урахування податку на вартість дарська продукції та додану вартість продук- послуг ція7 1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11 1 Послуги з пакування 82.92 посл. 2850 0,35 20 997,50 199,50
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(1);
    expect(parsed.lineItems[0]).toMatchObject({
      lineNo: 1,
      description: "Послуги з пакування",
      serviceCode: "82.92",
      unitName: "посл.",
      unitCode: null,
      quantity: "2850",
      unitPrice: "0.35",
      vatRate: "20",
      lineBaseAmount: "997.50",
      lineVatAmount: "199.50",
    });
  });

  it("extracts all six line items when VAT amounts use three decimal places", () => {
    const parsed = parseVatInvoiceUaV1(`Податкова накладна 0 9 0 4 2 0 2 6 2 7 /
(дата складання) (порядковий номер)
Постачальник (продавець) Отримувач (покупець)
ПРИВАТНЕ ПІДПРИЄМСТВО "ВОЛИНСЬКА ДРУКАРНЯ"
Товариство з обмеженою відповідальністю "АЛЬФА"
(найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця) (найменування; прізвище (за наявності), ім'я, по батькові (за наявності) - для фізичної особи - підприємця)
4 3 7 6 2 4 1 0 3 0 8 7 4 3 1 6 9 6 9 2 6 5 4 2 4 3 1 6 9 6 9 6 1
Розділ А
І Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість 108 494,49
ІІ Загальна сума податку на додану вартість, у тому числі: 18 082,41
VI Усього обсяги постачання за основною ставкою (код ставки 20) 90 412,08
VII Усього обсяги постачання за ставкою 7% (код ставки 7)
Розділ Б
1 2 3.1 3.2.1 3.2.2 3.3 4 5 6 7 8 9 10 11
1 ж-л " Тещин пиріг.Судоку"*48 стр №4 А4 /укр 4902 тис.прим 1755 2,7 6 600,00 20 17 820,00 3 564,00
2 ж-л "Товстий зять "*144 стр №4 4902 тис.прим 1755 0,76 19 566,64 20 14 870,65 2 974,13
3 ж-л "Філворди.Спецвипуск №4/саморобка/ *64 стр /укр 4902 тис.прим 1755 1,45 5 566,65 20 8 071,64 1 614,328
4 ж-л "Філворди.Спецвипуск №5/саморобка/ *64 стр /укр 4902 тис.прим 1755 1,45 5 566,65 20 8 071,64 1 614,328
5 ж-л "Цунамі " *48 стр №8 А4 /укр 4902 тис.прим 1755 4,5 6 258,35 20 28 162,58 5 632,516
6 ж-л "Цунамі.Судоку "*48стр №7 А4 / укр 4902 тис.прим 1755 2,55 6 800,00 20 17 340,00 3 468,00
Суми податку на додану вартість, нараховані (сплачені)`);

    expect(parsed.lineItems).toHaveLength(6);
    expect(parsed.lineItems.map((item) => item.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parsed.lineItems[2]).toMatchObject({
      lineNo: 3,
      serviceCode: "4902",
      unitName: "тис.прим",
      unitCode: "1755",
      quantity: "1.45",
      unitPrice: "5566.65",
      vatRate: "20",
      lineBaseAmount: "8071.64",
      lineVatAmount: "1614.328",
    });
    expect(parsed.lineItems[5]).toMatchObject({
      lineNo: 6,
      description: 'ж-л "Цунамі.Судоку "*48стр №7 А4 / укр',
      lineVatAmount: "3468.00",
    });
  });
});

describe("parsePublicationIssueDescription", () => {
  const documentDate = "23.04.2026";

  it("extracts publication and issue from a journal description with technical suffixes", () => {
    expect(
      parsePublicationIssueDescription(
        'ж-л " 1000 порад Кейворди " ( R )*96 стр №4 А4',
        documentDate,
      ),
    ).toEqual({
      publicationName: "1000 порад Кейворди (R)",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("keeps issue text with slash suffix", () => {
    expect(
      parsePublicationIssueDescription(
        'ж-л "Філворди.Спецвипуск №4/саморобка/ *64 стр /укр',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Філворди.Спецвипуск",
      rawIssueNumber: "4 (саморобка)",
      canonicalIssueNumber: "04-26 (саморобка)",
    });
  });

  it("removes A4/ukr technical suffixes from the issue number", () => {
    expect(parsePublicationIssueDescription('ж-л "Філворди" №5 А4/укр/', documentDate)).toEqual({
      publicationName: "Філворди",
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
    expect(parsePublicationIssueDescriptionRuV1('Печать"Кузя и друзья"№ 3', documentDate)).toEqual({
      publicationName: "Кузя и друзья",
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
        'Послуга друку газети "Філворди. Спецвипуск" (р) №4-26 (саморобки)',
        documentDate,
      ),
    ).toEqual({
      publicationName: "Філворди. Спецвипуск (р)",
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
    expect(parsePublicationIssueDescription('ж-л "Філворди" /R/ № 4', documentDate)).toEqual({
      publicationName: "Філворди (R)",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });
  });

  it("removes embedded star-page tokens before a trailing marker", () => {
    expect(
      parsePublicationIssueDescription('ж-л "Тещині млинці *80 стр (R) № 4', documentDate),
    ).toEqual({
      publicationName: "Тещині млинці (R)",
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
      description: 'ж-л "Філворди" №5 А4/укр/',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Філворди" №5 А5',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Філворди" /R/ №5',
      expected: {
        publicationName: "Філворди (R)",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "1000 порад.Сканворди" ( R ) №12',
      expected: {
        publicationName: "1000 порад.Сканворди (R)",
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
      description: 'ж-л "Філворди" №5 /укр/',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Філворди" №4-26 ( саморобки)',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "4-26 (саморобки)",
        canonicalIssueNumber: "04-26 (саморобки)",
      },
    },
    {
      description: 'ж-л "Філворди" №4/саморобка/',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "4 (саморобка)",
        canonicalIssueNumber: "04-26 (саморобка)",
      },
    },
    {
      description: 'послуга з друку газети "Тещин пиріг. Спецвипуск" №4',
      expected: {
        publicationName: "Тещин пиріг. Спецвипуск",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Філворди" №5/укр/В4',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "5",
        canonicalIssueNumber: "05-26",
      },
    },
    {
      description: 'ж-л "Філворди" №4 В4',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      },
    },
    {
      description: 'ж-л "Філворди" №4/2, спецвипуск',
      expected: {
        publicationName: "Філворди",
        rawIssueNumber: "4/2",
        canonicalIssueNumber: "04/2-26",
      },
    },
    {
      description: 'ж-л "Філворди" №4, спецвипуск',
      expected: {
        publicationName: "Філворди",
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
