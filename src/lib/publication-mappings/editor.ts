import type {
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
