import type {
  DocumentIssueMatchDto,
  IssueNumberCandidateDto,
  IssueNumberDraftSelection,
  PublicationCandidateDto,
  PublicationIssueMappingRow,
  PublicationMappingDto,
} from "@/lib/publication-mappings/types";

type BuildSavedRowsInput = {
  parsedPublicationName: string;
  parsedIssueNumber: string;
  publicationMappings: PublicationMappingDto[];
};

const byLabel = (left: string, right: string) => left.localeCompare(right, "uk-UA");

export const buildSavedMappingRows = ({
  parsedPublicationName,
  parsedIssueNumber,
  publicationMappings,
}: BuildSavedRowsInput): PublicationIssueMappingRow[] => {
  const sortedPublicationMappings = [...publicationMappings].sort((left, right) =>
    byLabel(left.externalEditionName, right.externalEditionName),
  );
  const rowCount = sortedPublicationMappings.length;

  return Array.from({ length: rowCount }, (_, index) => ({
    rowId: `saved-${index}`,
    kind: "saved" as const,
    parsedPublicationName,
    parsedIssueNumber,
    savedPublicationMapping: sortedPublicationMappings[index] ?? null,
    draftPublicationSelection: null,
    draftIssueSelection: null,
  }));
};

export const createDraftMappingRow = ({
  parsedPublicationName,
  parsedIssueNumber,
  rowId,
}: {
  parsedPublicationName: string;
  parsedIssueNumber: string;
  rowId: string;
}): PublicationIssueMappingRow => ({
  rowId,
  kind: "draft",
  parsedPublicationName,
  parsedIssueNumber,
  savedPublicationMapping: null,
  draftPublicationSelection: null,
  draftIssueSelection: null,
});

export const pickInitialPublicationCandidate = (candidates: PublicationCandidateDto[]) => {
  const exactCandidate = candidates.find((candidate) => candidate.isExactMatch);

  if (exactCandidate) {
    return exactCandidate;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const [firstCandidate, secondCandidate] = candidates;

  if (!firstCandidate) {
    return null;
  }

  if ((firstCandidate.score ?? 0) >= 0.92 && (secondCandidate?.score ?? 0) < firstCandidate.score) {
    return firstCandidate;
  }

  return null;
};

export const pickInitialIssueCandidate = (candidates: IssueNumberCandidateDto[]) =>
  candidates.find((candidate) => candidate.isExactMatch) ?? null;

export const getRowExternalEditionId = (row: PublicationIssueMappingRow) =>
  row.savedPublicationMapping?.externalEditionId ??
  row.draftPublicationSelection?.externalEditionId ??
  null;

export const syncIssueSelectionWithCandidates = ({
  candidates,
  selection,
}: {
  candidates: IssueNumberCandidateDto[];
  selection: IssueNumberDraftSelection | null;
}): IssueNumberDraftSelection | null => {
  if (!selection) {
    return null;
  }

  return candidates.some((candidate) => candidate.externalIssueId === selection.externalIssueId)
    ? selection
    : null;
};

export const toIssueDraftSelection = (
  match: Pick<DocumentIssueMatchDto, "externalIssueId" | "externalIssueNumber">,
): IssueNumberDraftSelection => ({
  externalIssueId: match.externalIssueId,
  externalIssueNumber: match.externalIssueNumber,
});

export const collectSelectionIdsFromRows = (rows: PublicationIssueMappingRow[]) => ({
  publicationSelectionIds: Array.from(
    new Set(
      rows.flatMap((row) => {
        const savedId = row.savedPublicationMapping?.externalEditionId;
        const draftId = row.draftPublicationSelection?.externalEditionId;

        return [savedId, draftId].filter((value): value is number => Number.isInteger(value));
      }),
    ),
  ),
});
