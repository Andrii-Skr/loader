export {
  canonicalizeIssueNumber,
  detectAndParseInvoice,
  detectInvoiceParser,
  getInvoiceParserByContour,
  InvoiceDetectionError,
  normalizeLookupKey,
  parsePublicationIssueDescriptionUaV1 as parsePublicationIssueDescription,
  parsePublicationIssueDescriptionRuV1,
  parsePublicationIssueDescriptionUaV1,
} from "@/lib/pdf/registry";
export { detectVatInvoiceRuV1, parseVatInvoiceRuV1 } from "@/lib/pdf/parser-ru";
export { detectVatInvoiceUaV1, parseVatInvoiceUaV1 } from "@/lib/pdf/parser-ua";
export type {
  DocumentContour,
  ParsedLineItem,
  ParsedParty,
  ParsedPublicationIssue,
  ParsedVatInvoice,
} from "@/lib/pdf/types";
