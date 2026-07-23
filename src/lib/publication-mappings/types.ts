export type PublicationMappingDto = {
  id: number;
  sourceCode: string;
  sourceDisplayName: string;
  externalEditionId: number;
  externalEditionName: string;
};

export type IssueNumberMappingDto = {
  id: number;
  sourceCode: string;
  sourceDisplayName: string;
  externalIssueId: number;
  externalIssueNumber: string;
};

export type PublicationCandidateDto = {
  externalEditionId: number;
  externalEditionName: string;
  isExactMatch: boolean;
  score: number;
};

export type IssueNumberCandidateDto = {
  externalIssueId: number;
  externalIssueNumber: string;
  isExactMatch: boolean;
  score: number;
};

export type LoadPublicationIssueEditorData = {
  publicationCandidates: PublicationCandidateDto[];
  autoSelectedPublicationCandidateId: number | null;
  initialIssueNumberCandidatesByEditionId: Record<number, IssueNumberCandidateDto[]>;
};

export type PublicationDraftSelection = {
  externalEditionId: number;
  externalEditionName: string;
};

export type IssueNumberDraftSelection = {
  externalIssueId: number;
  externalIssueNumber: string;
};

export type DocumentIssueMatchDto = {
  externalEditionId: number;
  externalEditionName?: string;
  externalIssueId: number;
  externalIssueNumber: string;
};

export type DocumentExternalMatchDetailDto = {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number | null;
  externalIssueNumber: string | null;
  quantity: string;
  unitPrice: string | null;
  lineBaseAmount: string | null;
  lineVatAmount: string | null;
  lineTotalAmount: string | null;
  currency: string;
  isPrimary: boolean;
};

export type DocumentLineAllocationDto = {
  specialDocumentId: number;
  lineNo: number;
  description: string;
  publicationIssueId: number | null;
  quantity: string;
  unitPrice: string;
  vatRate: string | null;
  lineBaseAmount: string;
  lineVatAmount: string;
  lineTotalAmount: string | null;
  currency: string;
  allocations: DocumentExternalMatchDetailDto[];
};

export type SaveDocumentLineAllocationsInput = {
  locale: string;
  documentId: number;
  allocations: Array<{
    specialDocumentId: number;
    matchDetails: Array<{
      externalEditionId: number;
      externalEditionName: string;
      externalIssueId: number;
      externalIssueNumber: string;
      quantity: string;
      unitPrice: string;
    }>;
  }>;
};

export type PublicationIssueMappingRow = {
  rowId: string;
  kind: "saved" | "draft";
  parsedPublicationName: string;
  parsedIssueNumber: string;
  savedPublicationMapping: PublicationMappingDto | null;
  draftPublicationSelection: PublicationDraftSelection | null;
  draftIssueSelection: IssueNumberDraftSelection | null;
};

export type SavePublicationIssueMappingRegistryInput = {
  locale: string;
  documentId?: number;
  publicationSelections: Array<{
    publicationId: number;
    selectionIds: number[];
  }>;
  issueMatches: Array<{
    publicationIssueId: number;
    matchDetails?: DocumentExternalMatchDetailDto[];
    matchedIssue: DocumentIssueMatchDto | null;
  }>;
};

export type PublicationIssueMatchSummary = {
  publicationIssueId: number;
  publicationId: number;
  issueNumberId: number;
  publicationName: string;
  parsedIssueNumber: string;
  canonicalIssueNumber: string;
  publicationMappingCount: number;
  publicationCandidateCount: number;
  issueNumberCandidateCount: number;
  fullyMatched: boolean;
  publicationMappings: PublicationMappingDto[];
};

export type PublicationIssueDocumentOccurrence = {
  documentNumber: string | null;
  sourceFileName: string;
  description: string;
  rawRowText: string | null;
};

export type PublicationIssueRegistryItem = PublicationIssueMatchSummary & {
  hasConfirmedDocumentMatch: boolean;
  documentOccurrences: PublicationIssueDocumentOccurrence[];
  documentOccurrenceCount: number;
  hasMultipleDocumentIssueMatches: boolean;
  documentIssueMatchCount: number;
  savedDocumentIssueMatch: DocumentIssueMatchDto | null;
  savedDocumentIssueMatchDetails: DocumentExternalMatchDetailDto[];
};

export type PublicationIssueRegistryFilter = "all" | "matched" | "unmatched" | "document-unmatched";
