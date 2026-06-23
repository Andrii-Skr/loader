import type { ParsedLineItem } from "@/lib/pdf/types";

export const normalizeSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

export const joinSplitDigits = (value: string): string => value.replace(/\s+/g, "");

export const normalizeMoney = (value: string): string =>
  value.replace(/\s+/g, "").replace(",", ".");

export const normalizeDashNull = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = normalizeSpaces(value);

  if (normalized === "-" || normalized === "—" || normalized === "Х") {
    return null;
  }

  return normalized;
};

export const normalizeSlashSpacing = (value: string): string => value.replace(/\s*\/\s*/g, "/");

export const digitsToDate = (value: string): string => {
  const digits = joinSplitDigits(value);

  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid date token: ${value}`);
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
};

export const capture = (text: string, pattern: RegExp, fieldName: string): string => {
  const match = text.match(pattern);

  if (!match?.[1]) {
    throw new Error(`Field not found: ${fieldName}`);
  }

  return normalizeSpaces(match[1]);
};

export const optionalCapture = (text: string, pattern: RegExp): string | null => {
  const match = text.match(pattern);
  return match?.[1] ? normalizeSpaces(match[1]) : null;
};

export const parseCommonLineItems = (tableSection: string): ParsedLineItem[] => {
  const patterns = [
    {
      regex:
        /(\d+)\s+([\s\S]*?)\s+([0-9.]+)\s+([^\s]+)\s+(\d+)\s+([0-9\s]+(?:,\d{1,3})?)\s+([0-9\s]+,\d{2,3})\s+(\d+)\s+([0-9\s]+,\d{2,3})\s+([0-9\s]+,\d{2,3})(?=\s+\d+\s+[\p{L}"«„“]|\s*$)/gmu,
      mapMatch: (match: RegExpMatchArray): ParsedLineItem => ({
        lineNo: Number.parseInt(match[1], 10),
        description: normalizeSpaces(match[2]),
        sourceRowCode: null,
        serviceCode: match[3] || null,
        itemTypeCode: null,
        unitName: match[4] || null,
        unitCode: match[5] || null,
        quantity: normalizeMoney(match[6]),
        unitPrice: normalizeMoney(match[7]),
        vatRate: match[8] || null,
        benefitCode: null,
        lineBaseAmount: normalizeMoney(match[9]),
        lineVatAmount: normalizeMoney(match[10]),
        exciseAmount: null,
        lineTotalAmount: null,
        countryCode: null,
        countryName: null,
        customsDeclarationNumber: null,
        rawRowText: normalizeSpaces(match[0]),
      }),
    },
    {
      regex:
        /(\d+)\s+([\s\S]*?)\s+([0-9.]+)\s+([^\s]+)\s+([0-9\s]+(?:,\d{1,3})?)\s+([0-9\s]+,\d{2,3})\s+(\d+)\s+([0-9\s]+,\d{2,3})\s+([0-9\s]+,\d{2,3})(?=\s+\d+\s+[\p{L}"«„“]|\s*$)/gmu,
      mapMatch: (match: RegExpMatchArray): ParsedLineItem => ({
        lineNo: Number.parseInt(match[1], 10),
        description: normalizeSpaces(match[2]),
        sourceRowCode: null,
        serviceCode: match[3] || null,
        itemTypeCode: null,
        unitName: match[4] || null,
        unitCode: null,
        quantity: normalizeMoney(match[5]),
        unitPrice: normalizeMoney(match[6]),
        vatRate: match[7] || null,
        benefitCode: null,
        lineBaseAmount: normalizeMoney(match[8]),
        lineVatAmount: normalizeMoney(match[9]),
        exciseAmount: null,
        lineTotalAmount: null,
        countryCode: null,
        countryName: null,
        customsDeclarationNumber: null,
        rawRowText: normalizeSpaces(match[0]),
      }),
    },
  ] as const;

  for (const pattern of patterns) {
    const matches = Array.from(tableSection.matchAll(pattern.regex));

    if (matches.length > 0) {
      return matches.map(pattern.mapMatch);
    }
  }

  return [];
};
