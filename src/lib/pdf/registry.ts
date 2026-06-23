import {
  detectVatInvoiceRuV1,
  parsePublicationIssueDescriptionRuV1,
  parseVatInvoiceRuV1,
} from "@/lib/pdf/parser-ru";
import {
  canonicalizeIssueNumber,
  detectVatInvoiceUaV1,
  parsePublicationIssueDescriptionUaV1,
  parseVatInvoiceUaV1,
} from "@/lib/pdf/parser-ua";
import type { DocumentContour, ParsedPublicationIssue, ParsedVatInvoice } from "@/lib/pdf/types";

type InvoiceParser = {
  contour: DocumentContour;
  parserVersion: string;
  lookupLocale: string;
  detect: (rawText: string) => number;
  parse: (rawText: string) => ParsedVatInvoice;
  parsePublicationIssueDescription: (
    description: string,
    documentDate: string,
  ) => ParsedPublicationIssue | null;
};

const invoiceParsers: InvoiceParser[] = [
  {
    contour: "UA",
    parserVersion: "vat-invoice-ua-v1",
    lookupLocale: "uk-UA",
    detect: detectVatInvoiceUaV1,
    parse: parseVatInvoiceUaV1,
    parsePublicationIssueDescription: parsePublicationIssueDescriptionUaV1,
  },
  {
    contour: "RU",
    parserVersion: "vat-invoice-ru-v1",
    lookupLocale: "ru-RU",
    detect: detectVatInvoiceRuV1,
    parse: parseVatInvoiceRuV1,
    parsePublicationIssueDescription: parsePublicationIssueDescriptionRuV1,
  },
];

export class InvoiceDetectionError extends Error {
  constructor(
    public readonly code: "documentContourUnknown" | "documentContourAmbiguous",
    message: string,
  ) {
    super(message);
    this.name = "InvoiceDetectionError";
  }
}

export const getInvoiceParserByContour = (contour: DocumentContour): InvoiceParser => {
  const parser = invoiceParsers.find((candidate) => candidate.contour === contour);

  if (!parser) {
    throw new Error(`Unsupported document contour: ${contour}`);
  }

  return parser;
};

export const detectInvoiceParser = (rawText: string): InvoiceParser => {
  const scores = invoiceParsers
    .map((parser) => ({
      parser,
      score: parser.detect(rawText),
    }))
    .sort((left, right) => right.score - left.score);

  const top = scores[0];
  const runnerUp = scores[1];

  if (!top || top.score <= 0) {
    throw new InvoiceDetectionError(
      "documentContourUnknown",
      "The document does not match any supported invoice contour.",
    );
  }

  if (runnerUp && runnerUp.score === top.score) {
    throw new InvoiceDetectionError(
      "documentContourAmbiguous",
      "The document matches multiple invoice contours equally well.",
    );
  }

  return top.parser;
};

export const detectAndParseInvoice = (rawText: string) => {
  const parser = detectInvoiceParser(rawText);

  return {
    contour: parser.contour,
    parserVersion: parser.parserVersion,
    parsed: parser.parse(rawText),
  };
};

export const normalizeLookupKey = (value: string, locale: string): string =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase(locale);

export {
  canonicalizeIssueNumber,
  parsePublicationIssueDescriptionUaV1,
  parsePublicationIssueDescriptionRuV1,
};
