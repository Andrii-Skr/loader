import { describe, expect, it } from "vitest";

import {
  buildSavedMappingRows,
  collectSelectionIdsFromRows,
  createDraftMappingRow,
  getRowExternalEditionId,
  syncIssueSelectionWithCandidates,
} from "@/lib/publication-mappings/editor";
import type { PublicationIssueMappingRow } from "@/lib/publication-mappings/types";

describe("buildSavedMappingRows", () => {
  it("builds rows from saved publication mappings only", () => {
    const rows = buildSavedMappingRows({
      parsedPublicationName: "Локальное издание",
      parsedIssueNumber: "04-26",
      publicationMappings: [
        {
          id: 1,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalEditionId: 10,
          externalEditionName: "А",
        },
        {
          id: 2,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalEditionId: 20,
          externalEditionName: "Б",
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.savedPublicationMapping?.externalEditionName).toBe("А");
    expect(rows[0]).not.toHaveProperty("savedIssueNumberMapping");
    expect(rows[1]?.savedPublicationMapping?.externalEditionName).toBe("Б");
  });
});

describe("collectSelectionIdsFromRows", () => {
  it("deduplicates saved and draft ids before save", () => {
    const draftRow = createDraftMappingRow({
      parsedPublicationName: "Локальное издание",
      parsedIssueNumber: "04-26",
      rowId: "draft-1",
    });

    const rows: PublicationIssueMappingRow[] = [
      {
        rowId: "saved-1",
        kind: "saved",
        parsedPublicationName: "Локальное издание",
        parsedIssueNumber: "04-26",
        savedPublicationMapping: {
          id: 1,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalEditionId: 20,
          externalEditionName: "А",
        },
        draftPublicationSelection: null,
        draftIssueSelection: null,
      },
      {
        ...draftRow,
        draftPublicationSelection: {
          externalEditionId: 20,
          externalEditionName: "А",
        },
        draftIssueSelection: {
          externalIssueId: 102,
          externalIssueNumber: "05-26",
        },
      },
    ];

    expect(collectSelectionIdsFromRows(rows)).toEqual({
      publicationSelectionIds: [20],
    });
  });
});

describe("getRowExternalEditionId", () => {
  it("prefers saved mapping edition id and falls back to draft selection", () => {
    expect(
      getRowExternalEditionId({
        rowId: "saved-1",
        kind: "saved",
        parsedPublicationName: "Локальное издание",
        parsedIssueNumber: "04-26",
        savedPublicationMapping: {
          id: 1,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalEditionId: 10,
          externalEditionName: "А",
        },
        draftPublicationSelection: {
          externalEditionId: 20,
          externalEditionName: "Б",
        },
        draftIssueSelection: null,
      }),
    ).toBe(10);

    expect(
      getRowExternalEditionId({
        rowId: "draft-1",
        kind: "draft",
        parsedPublicationName: "Локальное издание",
        parsedIssueNumber: "04-26",
        savedPublicationMapping: null,
        draftPublicationSelection: {
          externalEditionId: 20,
          externalEditionName: "Б",
        },
        draftIssueSelection: null,
      }),
    ).toBe(20);
  });
});

describe("syncIssueSelectionWithCandidates", () => {
  it("clears issue selection when it is not allowed by the selected edition", () => {
    expect(
      syncIssueSelectionWithCandidates({
        candidates: [
          { externalIssueId: 101, externalIssueNumber: "04-26", isExactMatch: true, score: 1 },
        ],
        selection: {
          externalIssueId: 202,
          externalIssueNumber: "05-26",
        },
      }),
    ).toBeNull();
  });

  it("keeps issue selection when it remains valid", () => {
    expect(
      syncIssueSelectionWithCandidates({
        candidates: [
          { externalIssueId: 101, externalIssueNumber: "04-26", isExactMatch: true, score: 1 },
        ],
        selection: {
          externalIssueId: 101,
          externalIssueNumber: "04-26",
        },
      }),
    ).toEqual({
      externalIssueId: 101,
      externalIssueNumber: "04-26",
    });
  });
});
