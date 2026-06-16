import type {
  IssueNumberMappingDto,
  PublicationIssueMappingRow,
  PublicationMappingDto,
} from "@/lib/publication-mappings/types";

type BuildSavedRowsInput = {
  parsedPublicationName: string;
  parsedIssueNumber: string;
  publicationMappings: PublicationMappingDto[];
  issueNumberMappings: IssueNumberMappingDto[];
};

const byLabel = (left: string, right: string) => left.localeCompare(right, "uk-UA");

export const buildSavedMappingRows = ({
  parsedPublicationName,
  parsedIssueNumber,
  publicationMappings,
  issueNumberMappings,
}: BuildSavedRowsInput): PublicationIssueMappingRow[] => {
  const sortedPublicationMappings = [...publicationMappings].sort((left, right) =>
    byLabel(left.externalEditionName, right.externalEditionName),
  );
  const sortedIssueNumberMappings = [...issueNumberMappings].sort((left, right) =>
    byLabel(left.externalIssueNumber, right.externalIssueNumber),
  );
  const rowCount = Math.max(sortedPublicationMappings.length, sortedIssueNumberMappings.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    rowId: `saved-${index}`,
    kind: "saved" as const,
    parsedPublicationName,
    parsedIssueNumber,
    savedPublicationMapping: sortedPublicationMappings[index] ?? null,
    savedIssueNumberMapping: sortedIssueNumberMappings[index] ?? null,
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
  savedIssueNumberMapping: null,
  draftPublicationSelection: null,
  draftIssueSelection: null,
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
  issueSelectionIds: Array.from(
    new Set(
      rows.flatMap((row) => {
        const savedId = row.savedIssueNumberMapping?.externalIssueId;
        const draftId = row.draftIssueSelection?.externalIssueId;

        return [savedId, draftId].filter((value): value is number => Number.isInteger(value));
      }),
    ),
  ),
});
