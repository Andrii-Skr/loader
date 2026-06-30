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
  issueNumberCandidates: IssueNumberCandidateDto[];
};

export type PublicationDraftSelection = {
  externalEditionId: number;
  externalEditionName: string;
};

export type IssueNumberDraftSelection = {
  externalIssueId: number;
  externalIssueNumber: string;
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
  issueConfirmations: Array<{
    publicationIssueId: number;
    hasConfirmedIssue: boolean;
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
};

export type PublicationIssueRegistryFilter = "all" | "matched" | "unmatched" | "document-unmatched";
