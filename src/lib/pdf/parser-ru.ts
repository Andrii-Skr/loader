import { normalizeDashNull, normalizeMoney, normalizeSpaces } from "@/lib/pdf/shared";
import type { ParsedLineItem, ParsedPublicationIssue, ParsedVatInvoice } from "@/lib/pdf/types";

const RU_MONTHS: Record<string, string> = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

const parseRuInvoiceDate = (value: string): string => {
  const normalized = normalizeSpaces(value).replace(/\s*г\.?$/u, "");
  const match = normalized.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/iu);

  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error("Field not found: documentDate");
  }

  const month = RU_MONTHS[match[2].toLocaleLowerCase("ru-RU")];

  if (!month) {
    throw new Error(`Unsupported RU month: ${match[2]}`);
  }

  return `${match[1].padStart(2, "0")}.${month}.${match[3]}`;
};

const extractTaxIdAndKpp = (
  text: string,
  entity: "продавца" | "покупателя",
): { taxId: string; kpp: string | null } => {
  const match = text.match(
    new RegExp(`ИНН\\/КПП\\s+${entity}\\s+(\\d{10}|\\d{12})(?:\\/(\\d{9}))?`, "iu"),
  );

  if (!match?.[1]) {
    throw new Error(`Field not found: ${entity}.taxId`);
  }

  return {
    taxId: match[1],
    kpp: match[2] ?? null,
  };
};

const captureNamedBlock = (
  text: string,
  label: string,
  endMarker: string,
  fieldName: string,
): string => {
  const match = text.match(new RegExp(`${label}\\s+([\\s\\S]*?)\\s+${endMarker}`, "u"));

  if (!match?.[1]) {
    throw new Error(`Field not found: ${fieldName}`);
  }

  return normalizeSpaces(match[1])
    .replace(/\(\d+[а-я]?\)\s*$/iu, "")
    .trim();
};

const stripRuPublicationPrefix = (value: string): string =>
  value
    .replace(/^типографские\s+работы\s+по\s+печати\s+/iu, "")
    .replace(/^печать\s*/iu, "")
    .replace(/^услуга\s+по\s+печати\s+/iu, "")
    .replace(/^журнала\s+/iu, "")
    .replace(/^журнал\s+/iu, "")
    .replace(/^издание\s+/iu, "")
    .replace(/^газеты\s+/iu, "")
    .replace(/^газета\s+/iu, "")
    .trim();

const isRuTechnicalIssueAnnotation = (value: string): boolean => {
  if (/заказ/iu.test(value)) {
    return true;
  }

  const hasFormatMarker =
    /ф\.?\s*[AА]\d+/iu.test(value) || /\d+\s*[AА]\d+/iu.test(value) || /[AА]\d+/iu.test(value);
  const hasPrintSpec =
    /\d+\+\d+/u.test(value) ||
    /\bпол\.?/iu.test(value) ||
    /\bобл\.?/iu.test(value) ||
    /\bвн\.?\s*блок\b/iu.test(value);

  return hasFormatMarker && hasPrintSpec;
};

const stripRuTechnicalIssueAnnotations = (value: string): string =>
  normalizeSpaces(
    value.replace(/\(([^()]*)\)/gu, (match, inner: string) =>
      isRuTechnicalIssueAnnotation(inner) ? "" : match,
    ),
  );

const normalizeRuYo = (value: string): string => value.replace(/Теща/gu, "Тёща");

const normalizeRuPublicationName = (value: string): string =>
  normalizeRuYo(
    normalizeSpaces(
      stripRuPublicationPrefix(value)
        .replace(/\s*\/\s*рус\.?\s*$/iu, "")
        .replace(/\s*\/\s*ru\s*$/iu, "")
        .replace(/\s*\/\s*$/u, "")
        .replace(/([\p{L}\d])\s*["«„“»”]\s*(?=[\p{L}\d])/gu, "$1 "),
    )
      .replace(/^["«„“]\s*/u, "")
      .replace(/\s*["»“”]\s*\(?\s*$/u, "")
      .trim(),
  );

const normalizeRuIssueNumber = (value: string): string =>
  normalizeSpaces(
    stripRuTechnicalIssueAnnotations(value)
      .replace(/^\(\s*№\s*/u, "")
      .replace(/^№\s*/u, "")
      .replace(/\s*\)\s*$/u, "")
      .replace(/\s*\/\s*рус\.?\s*\/?\s*$/iu, "")
      .replace(/\s*\/\s*ru\s*\/?\s*$/iu, "")
      .replace(/[\s.,;:]+$/u, ""),
  );

const canonicalizeRuIssueNumber = (rawIssueNumber: string, documentDate: string): string => {
  const normalized = normalizeRuIssueNumber(rawIssueNumber);
  const match = normalized.match(/^(\d+)(?:\/(\d+))?(?:-(\d{2}))?(\s*\(.+\))?$/u);

  if (!match?.[1]) {
    return normalized;
  }

  const primary = match[1].padStart(2, "0");
  const fraction = match[2] ? `/${match[2]}` : "";
  const yearSuffix = match[3] ?? documentDate.slice(-2);
  const trailingLabel = match[4] ? normalizeSpaces(match[4]) : "";

  return `${primary}${fraction}-${yearSuffix}${trailingLabel ? ` ${trailingLabel}` : ""}`;
};

const extractRuTableSection = (text: string): string => {
  const startMatch = text.match(/А 1 1а 1б 2 2а 3 4 5 6 7 8 9 10 10а 11([\s\S]+?)Всего к оплате/u);

  if (!startMatch?.[1]) {
    return "";
  }

  return startMatch[1];
};

const normalizeExciseAmount = (value: string): string | null => {
  const normalized = normalizeDashNull(value);

  if (!normalized || /без\s+акциза/iu.test(normalized)) {
    return null;
  }

  return normalizeMoney(normalized);
};

const isRuRowSourceCode = (token: string): boolean =>
  /^(?:БП-[^\s]+|[A-ZА-ЯЁ]{0,3}\d{8,})$/iu.test(token);

const RU_ROW_START_REGEX =
  /(?:^|\s)(-\s+[1-9]\d?\s+(?:\d+\s+)?[\p{L}"«„“]|(?:БП-[^\s]+|[A-ZА-ЯЁ]{0,3}\d{8,})\s+[1-9]\d?\s+(?:\d+\s+)?[\p{L}"«„“])/giu;

const splitRuTableRows = (tableSection: string): string[] => {
  const starts = Array.from(tableSection.matchAll(RU_ROW_START_REGEX), (match) => {
    const value = match[1] ?? match[0];
    return (match.index ?? 0) + match[0].lastIndexOf(value);
  });

  if (starts.length === 0) {
    return [];
  }

  return starts
    .map((start, index) => tableSection.slice(start, starts[index + 1] ?? tableSection.length))
    .map((row) => normalizeSpaces(row))
    .filter(Boolean);
};

const popToken = (tokens: string[]): string => {
  const token = tokens.pop();

  if (!token) {
    throw new Error("Unexpected RU row format");
  }

  return token;
};

const popMoneyToken = (tokens: string[], maxJoinedGroups = Number.POSITIVE_INFINITY): string => {
  let value = popToken(tokens);
  let joinedGroups = 0;

  while (tokens.length > 0 && joinedGroups < maxJoinedGroups) {
    const previous = tokens[tokens.length - 1];

    if (!previous || !/^\d{1,3}$/u.test(previous) || !/[.,]\d+$/u.test(value)) {
      break;
    }

    value = `${tokens.pop() ?? previous} ${value}`;
    joinedGroups += 1;
  }

  return normalizeMoney(value);
};

const popExciseToken = (tokens: string[]): string | null => {
  const last = popToken(tokens);

  if (last.toLocaleLowerCase("ru-RU") === "акциза" && tokens.length > 0) {
    const previous = tokens[tokens.length - 1];

    if (previous?.toLocaleLowerCase("ru-RU") === "без") {
      tokens.pop();
      return null;
    }
  }

  return normalizeExciseAmount(last);
};

const parseRuLineItemRow = (rowText: string): ParsedLineItem | null => {
  const tokens = normalizeSpaces(rowText).split(" ").filter(Boolean);

  if (tokens.length < 12) {
    return null;
  }

  if (tokens[0] === "-") {
    tokens.shift();
  }

  const sourceRowCode = tokens[0] && isRuRowSourceCode(tokens[0]) ? (tokens.shift() ?? null) : null;
  const lineNoToken = tokens.shift();

  if (!lineNoToken || !/^\d+$/u.test(lineNoToken)) {
    return null;
  }

  const tailTokens: string[] = [];

  while (tokens.length > 0 && /^-|[\p{L}.-]+$/u.test(tokens[tokens.length - 1] ?? "")) {
    const last = tokens[tokens.length - 1];

    if (last && /[.,]\d+$/u.test(last)) {
      break;
    }

    tailTokens.unshift(popToken(tokens));

    if (tailTokens.length === 3) {
      break;
    }
  }

  const lineTotalAmount = popMoneyToken(tokens);
  const lineVatAmount = popMoneyToken(tokens);
  const vatRate = normalizeDashNull(popToken(tokens));
  const exciseAmount = popExciseToken(tokens);
  const lineBaseAmount = popMoneyToken(tokens);
  const unitPrice = popMoneyToken(tokens, 1);
  const quantity = normalizeMoney(popToken(tokens));
  const unitName = normalizeDashNull(popToken(tokens));
  const unitCode = normalizeDashNull(popToken(tokens));
  let itemTypeCode = normalizeDashNull(popToken(tokens));

  if (
    !itemTypeCode &&
    tokens[tokens.length - 1] &&
    /^\d+$/u.test(tokens[tokens.length - 1] ?? "")
  ) {
    itemTypeCode = normalizeDashNull(popToken(tokens));
  }

  let serviceCode: string | null = null;

  if (tokens.length > 0 && /^\d+(?:[./-]\d+)*$/u.test(tokens[0] ?? "")) {
    serviceCode = normalizeDashNull(tokens.shift());
  }

  let description = normalizeSpaces(tokens.join(" ")).replace(/\s+-$/u, "").trim();

  if (itemTypeCode && /^\d+(?:[./-]\d+)*$/u.test(itemTypeCode) && /№$/u.test(description)) {
    description = `${description} ${itemTypeCode}`.trim();
    itemTypeCode = null;
  }

  if (!description) {
    return null;
  }

  return {
    lineNo: Number.parseInt(lineNoToken, 10),
    description,
    sourceRowCode,
    serviceCode,
    itemTypeCode,
    unitName,
    unitCode,
    quantity,
    unitPrice,
    vatRate,
    benefitCode: null,
    lineBaseAmount,
    lineVatAmount,
    exciseAmount,
    lineTotalAmount,
    countryCode: normalizeDashNull(tailTokens[0]),
    countryName: normalizeDashNull(tailTokens[1]),
    customsDeclarationNumber: normalizeDashNull(tailTokens[2]),
    rawRowText: normalizeSpaces(rowText),
  };
};

const parseRuLineItems = (text: string): ParsedLineItem[] => {
  const tableSection = extractRuTableSection(text);

  if (!tableSection) {
    return [];
  }

  return splitRuTableRows(tableSection)
    .map((row) => parseRuLineItemRow(row))
    .filter((item): item is ParsedLineItem => item !== null);
};

const parseRuDocumentTotals = (text: string) => {
  const totalsMatch = text.match(
    /Всего к оплате\s+([0-9\s]+(?:[.,]\d+)?)\s+Х\s+([0-9\s]+(?:[.,]\d+)?)\s+([0-9\s]+(?:[.,]\d+)?)/u,
  );

  if (!totalsMatch?.[1] || !totalsMatch[2] || !totalsMatch[3]) {
    throw new Error("Field not found: totalAmount");
  }

  return {
    baseAmount: normalizeMoney(totalsMatch[1]),
    vatAmount: normalizeMoney(totalsMatch[2]),
    totalAmount: normalizeMoney(totalsMatch[3]),
  };
};

export const detectVatInvoiceRuV1 = (rawText: string): number => {
  const text = rawText.replace(/\r/g, "");
  let score = 0;

  if (/Универсальный передаточный документ/iu.test(text)) score += 4;
  if (/Счет-фактура\s+№/iu.test(text)) score += 4;
  if (/Продавец/iu.test(text)) score += 2;
  if (/Покупатель/iu.test(text)) score += 2;
  if (/ИНН\/КПП\s+продавца/iu.test(text)) score += 2;
  if (/ИНН\/КПП\s+покупателя/iu.test(text)) score += 2;
  if (/Всего к оплате/iu.test(text)) score += 1;

  return score;
};

export const parsePublicationIssueDescriptionRuV1 = (
  description: string,
  documentDate: string,
): ParsedPublicationIssue | null => {
  const issueMarkerIndex = description.indexOf("№");

  if (issueMarkerIndex === -1) {
    return null;
  }

  const publicationName = normalizeRuPublicationName(description.slice(0, issueMarkerIndex));
  const rawIssueNumber = normalizeRuIssueNumber(description.slice(issueMarkerIndex));

  if (!publicationName || !rawIssueNumber) {
    return null;
  }

  return {
    publicationName,
    rawIssueNumber,
    canonicalIssueNumber: canonicalizeRuIssueNumber(rawIssueNumber, documentDate),
  };
};

export const parseVatInvoiceRuV1 = (rawText: string): ParsedVatInvoice => {
  const text = rawText.replace(/\r/g, "");

  if (/Универсальный передаточный документ/iu.test(text) && !/Счет-фактура\s+№/iu.test(text)) {
    throw new Error("Field not found: documentType/documentNumber/documentDate");
  }

  const headerMatch = text.match(
    /(Счет-фактура)\s*№\s*([0-9a-zа-яё./-]+)\s+от\s+(\d{1,2}\s+[а-яё]+\s+\d{4}\s+г\.)/iu,
  );

  if (!headerMatch?.[1] || !headerMatch[2] || !headerMatch[3]) {
    throw new Error("Field not found: documentType/documentNumber/documentDate");
  }

  const supplier = captureNamedBlock(text, "Продавец", "Адрес", "supplier.name");
  const recipient = captureNamedBlock(text, "Покупатель", "Адрес", "recipient.name");
  const supplierIds = extractTaxIdAndKpp(text, "продавца");
  const recipientIds = extractTaxIdAndKpp(text, "покупателя");
  const totals = parseRuDocumentTotals(text);
  const lineItems = parseRuLineItems(text);

  return {
    documentType: normalizeSpaces(headerMatch[1]),
    documentNumber: normalizeSpaces(headerMatch[2]),
    documentDate: parseRuInvoiceDate(headerMatch[3]),
    supplier: {
      name: supplier,
      taxId: supplierIds.taxId,
      kpp: supplierIds.kpp,
    },
    recipient: {
      name: recipient,
      taxId: recipientIds.taxId,
      kpp: recipientIds.kpp,
    },
    totalAmount: totals.totalAmount,
    vatAmount: totals.vatAmount,
    baseAmount: totals.baseAmount,
    lineItems,
    rawText,
    reviewRequired: lineItems.length === 0,
  };
};
