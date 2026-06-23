export type DocumentContour = "UA" | "RU";

export type ParsedParty = {
  name: string;
  taxId: string;
  kpp: string | null;
};

export type ParsedLineItem = {
  lineNo: number;
  description: string;
  sourceRowCode: string | null;
  serviceCode: string | null;
  itemTypeCode: string | null;
  unitName: string | null;
  unitCode: string | null;
  quantity: string;
  unitPrice: string;
  vatRate: string | null;
  benefitCode: string | null;
  lineBaseAmount: string;
  lineVatAmount: string;
  exciseAmount: string | null;
  lineTotalAmount: string | null;
  countryCode: string | null;
  countryName: string | null;
  customsDeclarationNumber: string | null;
  rawRowText: string;
};

export type ParsedVatInvoice = {
  documentType: string;
  documentNumber: string;
  documentDate: string;
  supplier: ParsedParty;
  recipient: ParsedParty;
  totalAmount: string;
  vatAmount: string | null;
  baseAmount: string | null;
  lineItems: ParsedLineItem[];
  rawText: string;
  reviewRequired: boolean;
};

export type ParsedPublicationIssue = {
  publicationName: string;
  rawIssueNumber: string;
  canonicalIssueNumber: string;
};
