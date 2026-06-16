import { describe, expect, it } from "vitest";

import {
  buildSavedMappingRows,
  collectSelectionIdsFromRows,
  createDraftMappingRow,
} from "@/lib/publication-mappings/editor";
import type { PublicationIssueMappingRow } from "@/lib/publication-mappings/types";

describe("buildSavedMappingRows", () => {
  it("builds rows by max saved side length and fills missing cells with null", () => {
    const rows = buildSavedMappingRows({
      parsedPublicationName: "Локальное издание",
      parsedIssueNumber: "04-26",
      publicationMappings: [
        {
          id: 2,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalEditionId: 20,
          externalEditionName: "Б",
        },
      ],
      issueNumberMappings: [
        {
          id: 11,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalIssueId: 101,
          externalIssueNumber: "03-26",
        },
        {
          id: 12,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalIssueId: 102,
          externalIssueNumber: "04-26",
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.savedPublicationMapping?.externalEditionName).toBe("Б");
    expect(rows[0]?.savedIssueNumberMapping?.externalIssueNumber).toBe("03-26");
    expect(rows[1]?.savedPublicationMapping).toBeNull();
    expect(rows[1]?.savedIssueNumberMapping?.externalIssueNumber).toBe("04-26");
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
        savedIssueNumberMapping: {
          id: 2,
          sourceCode: "idz-ukr",
          sourceDisplayName: "IDZ-UKR",
          externalIssueId: 101,
          externalIssueNumber: "04-26",
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
      issueSelectionIds: [101, 102],
    });
  });
});
