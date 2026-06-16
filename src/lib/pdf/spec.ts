export type ExtractionEntity = "supplier" | "recipient" | "document" | "special_document";

export type ExtractionType = "string" | "date" | "decimal" | "int";

export type NormalizeRule =
  | "trim"
  | "collapse_spaces"
  | "digits_join"
  | "money_ua"
  | "date_ddmmyyyy";

export type ExtractFieldSpec = {
  entity: ExtractionEntity;
  field: string;
  label: string;
  required: boolean;
  type: ExtractionType;
  selectorHint: string;
  normalize: NormalizeRule[];
};

export const VAT_INVOICE_UA_V1_SPEC: ExtractFieldSpec[] = [
  {
    entity: "document",
    field: "documentType",
    label: "Тип документа",
    required: true,
    type: "string",
    selectorHint: "Податкова накладна",
    normalize: ["trim", "collapse_spaces"],
  },
  {
    entity: "document",
    field: "documentNumber",
    label: "Порядковий номер",
    required: true,
    type: "string",
    selectorHint: "(порядковий номер)",
    normalize: ["trim", "collapse_spaces"],
  },
  {
    entity: "document",
    field: "documentDate",
    label: "Дата складання",
    required: true,
    type: "date",
    selectorHint: "(дата складання)",
    normalize: ["digits_join", "date_ddmmyyyy"],
  },
  {
    entity: "supplier",
    field: "name",
    label: "Постачальник",
    required: true,
    type: "string",
    selectorHint: "Постачальник (продавець)",
    normalize: ["trim", "collapse_spaces"],
  },
  {
    entity: "supplier",
    field: "taxId",
    label: "ІПН постачальника",
    required: true,
    type: "string",
    selectorHint: "Постачальник ... (індивідуальний податковий номер)",
    normalize: ["digits_join"],
  },
  {
    entity: "recipient",
    field: "name",
    label: "Отримувач",
    required: true,
    type: "string",
    selectorHint: "Отримувач (покупець)",
    normalize: ["trim", "collapse_spaces"],
  },
  {
    entity: "recipient",
    field: "taxId",
    label: "ІПН отримувача",
    required: true,
    type: "string",
    selectorHint: "Отримувач ... (індивідуальний податковий номер)",
    normalize: ["digits_join"],
  },
  {
    entity: "document",
    field: "totalAmount",
    label: "Загальна сума коштів до сплати з ПДВ",
    required: true,
    type: "decimal",
    selectorHint:
      "Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість",
    normalize: ["money_ua"],
  },
  {
    entity: "document",
    field: "vatAmount",
    label: "Загальна сума ПДВ",
    required: false,
    type: "decimal",
    selectorHint: "Загальна сума податку на додану вартість",
    normalize: ["money_ua"],
  },
  {
    entity: "document",
    field: "baseAmount",
    label: "Усього обсяги постачання за основною ставкою",
    required: false,
    type: "decimal",
    selectorHint: "Усього обсяги постачання за основною ставкою",
    normalize: ["money_ua"],
  },
];

export const VAT_INVOICE_UA_V1_TABLE_COLUMNS: ExtractFieldSpec[] = [
  {
    entity: "special_document",
    field: "lineNo",
    label: "№ з/п",
    required: true,
    type: "int",
    selectorHint: "№ з/п",
    normalize: [],
  },
  {
    entity: "special_document",
    field: "description",
    label: "Опис (номенклатура)",
    required: true,
    type: "string",
    selectorHint: "Опис (номенклатура) товарів/послуг продавця",
    normalize: ["trim", "collapse_spaces"],
  },
  {
    entity: "special_document",
    field: "serviceCode",
    label: "Код послуги",
    required: false,
    type: "string",
    selectorHint: "послуги згідно з Державним класифікатором продукції та послуг",
    normalize: ["trim"],
  },
  {
    entity: "special_document",
    field: "unitName",
    label: "Одиниця виміру",
    required: false,
    type: "string",
    selectorHint: "умовне позначення (українське)",
    normalize: ["trim"],
  },
  {
    entity: "special_document",
    field: "unitCode",
    label: "Код одиниці",
    required: false,
    type: "string",
    selectorHint: "код",
    normalize: ["trim"],
  },
  {
    entity: "special_document",
    field: "quantity",
    label: "Кількість",
    required: true,
    type: "decimal",
    selectorHint: "Кількість (об'єм, обсяг)",
    normalize: ["money_ua"],
  },
  {
    entity: "special_document",
    field: "unitPrice",
    label: "Ціна без ПДВ",
    required: true,
    type: "decimal",
    selectorHint: "Ціна постачання одиниці товару / послуги",
    normalize: ["money_ua"],
  },
  {
    entity: "special_document",
    field: "vatRate",
    label: "Код ставки",
    required: false,
    type: "string",
    selectorHint: "Код ставки",
    normalize: ["trim"],
  },
  {
    entity: "special_document",
    field: "benefitCode",
    label: "Код пільги",
    required: false,
    type: "string",
    selectorHint: "Код пільги",
    normalize: ["trim"],
  },
  {
    entity: "special_document",
    field: "lineBaseAmount",
    label: "Обсяги постачання без ПДВ",
    required: true,
    type: "decimal",
    selectorHint: "Обсяги постачання (база оподаткування) без урахування податку",
    normalize: ["money_ua"],
  },
  {
    entity: "special_document",
    field: "lineVatAmount",
    label: "Сума ПДВ",
    required: true,
    type: "decimal",
    selectorHint: "Сума податку на додану вартість",
    normalize: ["money_ua"],
  },
];
