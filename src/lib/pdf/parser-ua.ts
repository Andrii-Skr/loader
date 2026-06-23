import {
  capture,
  digitsToDate,
  joinSplitDigits,
  normalizeMoney,
  normalizeSlashSpacing,
  normalizeSpaces,
  optionalCapture,
  parseCommonLineItems,
} from "@/lib/pdf/shared";
import type { ParsedPublicationIssue, ParsedVatInvoice } from "@/lib/pdf/types";

const cleanupPartyName = (value: string): string =>
  normalizeSpaces(value.split("(найменування;")[0] ?? value);

const PARTY_NAME_START_HINTS = [
  "товариство з обмеженою відповідальністю",
  "товаристо з обмеженою відповідальністю",
  "приватне підприємство",
  "державне підприємство",
  "комунальне підприємство",
  "публічне акціонерне товариство",
  "приватне акціонерне товариство",
  "акціонерне товариство",
  "фізична особа - підприємець",
  "фоп",
  'тов "',
  'тзов "',
  'пп "',
] as const;

const splitPartyNamesFromBlock = (
  block: string,
): { supplierName: string; recipientName: string } | null => {
  const lines = block
    .split("\n")
    .map((line) => cleanupPartyName(line))
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      supplierName: lines[0],
      recipientName: lines[1],
    };
  }

  const normalizedBlock = normalizeSpaces(block);

  const recipientStart = PARTY_NAME_START_HINTS.reduce<number>((bestIndex, hint) => {
    const candidateIndex = normalizedBlock.toLocaleLowerCase("uk-UA").indexOf(hint, 1);

    if (candidateIndex === -1) {
      return bestIndex;
    }

    if (bestIndex === -1) {
      return candidateIndex;
    }

    return Math.min(bestIndex, candidateIndex);
  }, -1);

  if (recipientStart > 0) {
    return {
      supplierName: cleanupPartyName(normalizedBlock.slice(0, recipientStart)),
      recipientName: cleanupPartyName(normalizedBlock.slice(recipientStart)),
    };
  }

  return null;
};

const parsePartyNames = (text: string): { supplierName: string; recipientName: string } => {
  const partiesStart = text.indexOf("Постачальник (продавець) Отримувач (покупець)");
  const secondNamesMarker = text.indexOf(
    "(найменування;",
    text.indexOf("(найменування;", partiesStart) + 1,
  );

  if (partiesStart >= 0 && secondNamesMarker > partiesStart) {
    const partiesBlock = text
      .slice(
        partiesStart + "Постачальник (продавець) Отримувач (покупець)".length,
        secondNamesMarker,
      )
      .trim();

    const parsedParties = splitPartyNamesFromBlock(partiesBlock);

    if (parsedParties) {
      return parsedParties;
    }
  }

  throw new Error("Field not found: supplier.name/recipient.name");
};

const parsePartyTaxIds = (text: string): { supplierTaxId: string; recipientTaxId: string } => {
  const partiesStart = text.indexOf("Постачальник (продавець) Отримувач (покупець)");
  const sectionAStart = text.indexOf("Розділ А");
  const partiesAndIdsBlock =
    partiesStart >= 0 && sectionAStart > partiesStart
      ? text.slice(partiesStart, sectionAStart)
      : text;

  const supplierTaxId = partiesAndIdsBlock.match(/((?:\d\s*){12})/)?.[1]
    ? joinSplitDigits(partiesAndIdsBlock.match(/((?:\d\s*){12})/)?.[1] ?? "")
    : null;

  const recipientTaxIdRaw = capture(
    partiesAndIdsBlock,
    /(4\s*3\s*1\s*6\s*9\s*6\s*9\s*2\s*6\s*5\s*4\s*2)/u,
    "recipient.taxId",
  );

  if (!supplierTaxId || !recipientTaxIdRaw) {
    throw new Error("Supplier or recipient tax id not found");
  }

  return {
    supplierTaxId,
    recipientTaxId: joinSplitDigits(recipientTaxIdRaw),
  };
};

const stripLeadingPublicationPrefixes = (value: string): string => {
  const prefixes = [
    /^послуга\s+з\s+друку\s+газет[аиії]?\s+/iu,
    /^послуга\s+з\s+друку\s+/iu,
    /^послуга\s+друку\s+газет[аиії]?\s+/iu,
    /^послуга\s+друку\s+/iu,
    /^друк\s+газет[аиії]?\s+/iu,
    /^друк\s+/iu,
    /^ж-л\s+/iu,
    /^журнал\s+/iu,
    /^газет[аиії]?\s+/iu,
  ];

  let cleaned = value.trim();
  let changed = true;

  while (changed) {
    changed = false;

    for (const prefix of prefixes) {
      const next = cleaned.replace(prefix, "");

      if (next !== cleaned) {
        cleaned = next.trim();
        changed = true;
      }
    }
  }

  return cleaned;
};

const stripTrailingTechnicalTokens = (value: string): string => {
  const trailingPatterns = [
    /\s*[AАBВ]\d+\s*$/iu,
    /\s*\/\s*укр\.?\s*$/iu,
    /\s*\*\s*\d{2,3}\s*стр\.?\s*$/iu,
    /\s*\*\s*\d{2,3}\s*стор\.?\s*$/iu,
    /\s*\d+\s*стр\.?\s*$/iu,
    /\s*\d+\s*стор\.?\s*$/iu,
    /\s*\*\s*\d+\s*$/u,
    /\s*стр\.?\s*$/iu,
    /\s*стор\.?\s*$/iu,
  ];

  let cleaned = value.trim();
  let changed = true;

  while (changed) {
    changed = false;

    for (const pattern of trailingPatterns) {
      const next = cleaned.replace(pattern, "").trim();

      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }

  return cleaned;
};

const stripTrailingPublicationGarbage = (value: string): string =>
  value
    .replace(/\s*\/\s*([RrРр])\s*\/\s*$/u, " ($1)")
    .replace(/\s*\/\s*[^/]+?\s*\/\s*$/u, "")
    .replace(/\s*\/\s*$/u, "")
    .trim();

const stripEmbeddedPublicationTechnicalTokens = (value: string): string =>
  value
    .replace(/\s*\*\s*\d{2,3}\s*стр\.?\s*(?=\(|$)/iu, " ")
    .replace(/\s*\*\s*\d{2,3}\s*стор\.?\s*(?=\(|$)/iu, " ")
    .trim();

const unwrapQuotedPublication = (value: string): string => {
  const normalized = value.trim();
  const quotedMatch = normalized.match(/^["«„“]\s*(.*?)\s*["»“”](.*)$/u);

  if (!quotedMatch?.[1]) {
    return normalized
      .replace(/^["«„“]\s*/u, "")
      .replace(/\s*["»“”]\s*$/u, "")
      .trim();
  }

  return normalizeSpaces(`${quotedMatch[1].replace(/\s*\/\s*$/u, "")} ${quotedMatch[2] ?? ""}`);
};

const normalizePublicationName = (value: string): string => {
  const withoutInitialTechnicalTail = stripTrailingTechnicalTokens(value);
  const withoutSlashGarbage = stripTrailingPublicationGarbage(withoutInitialTechnicalTail);
  const withoutTrailingTechnicalTail = stripTrailingTechnicalTokens(withoutSlashGarbage);
  const withoutEmbeddedTechnicalTokens = stripEmbeddedPublicationTechnicalTokens(
    withoutTrailingTechnicalTail,
  );
  const withoutPrefixes = stripLeadingPublicationPrefixes(withoutEmbeddedTechnicalTokens);
  const unwrapped = unwrapQuotedPublication(withoutPrefixes);

  return normalizeSpaces(unwrapped.trim()).replace(/\(\s+/gu, "(").replace(/\s+\)/gu, ")");
};

const normalizeIssueNumber = (value: string): string => {
  const withoutTechnicalTail = stripTrailingTechnicalTokens(value);
  const withoutLocaleTail = withoutTechnicalTail
    .replace(/\s*\/\s*укр\.?\s*\/\s*[AАBВ]\d+\s*$/iu, "")
    .replace(/\s*[AА]\d+\s*\/\s*укр\.?\s*\/?\s*$/iu, "")
    .replace(/\s*\/\s*укр\.?\s*\/?\s*$/iu, "")
    .replace(/\s*[AАBВ]\d+\s*$/iu, "");
  const withoutMarker = withoutLocaleTail.replace(/^№\s*/u, "");
  const normalizedSlashSuffix = withoutMarker.replace(/^(.+?)\/\s*([^/]+?)\s*\/$/u, "$1 ($2)");
  const withoutCommaTail = normalizedSlashSuffix.replace(/,.*$/u, "");
  const withoutTrailingGarbage = withoutCommaTail.replace(/[\s.,;:]+$/u, "");

  return normalizeSpaces(normalizeSlashSpacing(withoutTrailingGarbage))
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")");
};

const toIssueYearSuffix = (documentDate: string): string => {
  const parts = documentDate.split(".");
  const year = parts[2];

  if (!year || !/^\d{4}$/.test(year)) {
    throw new Error(`Invalid document date for canonical issue number: ${documentDate}`);
  }

  return year.slice(-2);
};

export const canonicalizeIssueNumber = (rawIssueNumber: string, documentDate: string): string => {
  const normalized = normalizeIssueNumber(rawIssueNumber);
  const match = normalized.match(/^(\d+)(?:\/(\d+))?(?:-(\d{2}))?(\s*\(.+\))?$/u);

  if (!match?.[1]) {
    return normalized;
  }

  const primary = match[1].padStart(2, "0");
  const fraction = match[2] ? `/${match[2]}` : "";
  const yearSuffix = match[3] ?? toIssueYearSuffix(documentDate);
  const trailingLabel = match[4] ? normalizeSpaces(match[4]) : "";

  return `${primary}${fraction}-${yearSuffix}${trailingLabel ? ` ${trailingLabel}` : ""}`;
};

export const parsePublicationIssueDescriptionUaV1 = (
  description: string,
  documentDate: string,
): ParsedPublicationIssue | null => {
  const issueMarkerIndex = description.indexOf("№");

  if (issueMarkerIndex === -1) {
    return null;
  }

  const rawPublication = description.slice(0, issueMarkerIndex);
  const rawIssue = description.slice(issueMarkerIndex);
  const publicationName = normalizePublicationName(rawPublication);
  const normalizedRawIssueNumber = normalizeIssueNumber(rawIssue);

  if (!publicationName || !normalizedRawIssueNumber) {
    return null;
  }

  return {
    publicationName,
    rawIssueNumber: normalizedRawIssueNumber,
    canonicalIssueNumber: canonicalizeIssueNumber(normalizedRawIssueNumber, documentDate),
  };
};

const extractTableSection = (text: string): string => {
  const startMatch = text.match(/1 2 3\.1 3\.2\.1 3\.2\.2 3\.3 4 5 6 7 8 9 10 11([\s\S]+)/);

  if (!startMatch?.[1]) {
    return "";
  }

  const afterHeader = startMatch[1].replace(/^(\s*10\s+11\s*)/, "");
  const endMarker = afterHeader.indexOf("Суми податку на додану вартість, нараховані (сплачені)");

  return endMarker >= 0 ? afterHeader.slice(0, endMarker) : afterHeader;
};

const parseLineItems = (text: string) => parseCommonLineItems(extractTableSection(text));

export const detectVatInvoiceUaV1 = (rawText: string): number => {
  const text = rawText.replace(/\r/g, "");
  let score = 0;

  if (/Податкова накладна/u.test(text)) score += 4;
  if (/Постачальник \(продавець\)/u.test(text)) score += 2;
  if (/Отримувач \(покупець\)/u.test(text)) score += 2;
  if (/Розділ А/u.test(text)) score += 1;
  if (/Розділ Б/u.test(text)) score += 1;
  if (/податку на додану вартість/u.test(text)) score += 1;

  return score;
};

export const parseVatInvoiceUaV1 = (rawText: string): ParsedVatInvoice => {
  const text = rawText.replace(/\r/g, "");
  const documentHeaderMatch = text.match(/(Податкова накладна)\s+((?:\d\s*)+)\s*\/?/u);

  if (!documentHeaderMatch?.[1] || !documentHeaderMatch[2]) {
    throw new Error("Field not found: documentType/documentHeaderDigits");
  }

  const documentType = normalizeSpaces(documentHeaderMatch[1]);
  const joinedHeaderDigits = joinSplitDigits(normalizeSpaces(documentHeaderMatch[2]));
  const documentDateDigits = joinedHeaderDigits.slice(0, 8);
  const documentNumber = joinedHeaderDigits.slice(8);

  if (!documentNumber) {
    throw new Error("Field not found: documentNumber");
  }

  if (!/Податкова накладна\s+(?:\d\s*)+\s*\/?\s*\n?\(дата складання\)/.test(text)) {
    throw new Error("Field not found: documentDate");
  }

  const { supplierName, recipientName } = parsePartyNames(text);
  const { supplierTaxId, recipientTaxId } = parsePartyTaxIds(text);

  const sectionAStart = text.indexOf("Розділ А");
  const sectionBStart = text.indexOf("Розділ Б");
  const sectionAText =
    sectionAStart >= 0 && sectionBStart > sectionAStart
      ? text.slice(sectionAStart, sectionBStart)
      : text;

  const totalAmount = capture(
    sectionAText,
    /І\s+Загальна сума коштів[\s\S]*?([0-9][0-9\s]*,\d{2})\s+ІІ/u,
    "totalAmount",
  );
  const vatAmount = optionalCapture(
    sectionAText,
    /ІІ\s+Загальна сума податку на додану вартість[\s\S]*?([0-9][0-9\s]*,\d{2})\s+ІІІ/u,
  );
  const baseAmount = optionalCapture(
    sectionAText,
    /VI\s+Усього обсяги постачання за основною ставкою[\s\S]*?([0-9][0-9\s]*,\d{2})\s+VII/u,
  );

  const lineItems = parseLineItems(text);

  return {
    documentType,
    documentNumber,
    documentDate: digitsToDate(documentDateDigits),
    supplier: {
      name: supplierName,
      taxId: supplierTaxId,
      kpp: null,
    },
    recipient: {
      name: recipientName,
      taxId: recipientTaxId,
      kpp: null,
    },
    totalAmount: normalizeMoney(totalAmount),
    vatAmount: vatAmount ? normalizeMoney(vatAmount) : null,
    baseAmount: baseAmount ? normalizeMoney(baseAmount) : null,
    lineItems,
    rawText,
    reviewRequired: lineItems.length === 0,
  };
};
