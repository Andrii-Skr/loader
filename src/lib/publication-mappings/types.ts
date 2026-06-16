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
  savedIssueNumberMapping: IssueNumberMappingDto | null;
  draftPublicationSelection: PublicationDraftSelection | null;
  draftIssueSelection: IssueNumberDraftSelection | null;
};

export type SavePublicationIssueMappingRegistryInput = {
  locale: string;
  publicationSelections: Array<{
    publicationId: number;
    selectionIds: number[];
  }>;
  issueSelections: Array<{
    issueNumberId: number;
    selectionIds: number[];
  }>;
};

export type PublicationIssueMatchSummary = {
  publicationIssueId: number;
  publicationId: number;
  issueNumberId: number;
  publicationName: string;
  canonicalIssueNumber: string;
  publicationMappingCount: number;
  issueNumberMappingCount: number;
  publicationCandidateCount: number;
  issueNumberCandidateCount: number;
  fullyMatched: boolean;
  publicationMappings: PublicationMappingDto[];
  issueNumberMappings: IssueNumberMappingDto[];
};

export type PublicationIssueRegistryItem = PublicationIssueMatchSummary & {
  sampleDescriptions: string[];
  documentLabels: string[];
};

export type PublicationIssueRegistryFilter = "all" | "matched" | "unmatched";
