import { describe, expect, it } from "vitest";

import {
  buildSavedMappingRows,
  collectSelectionIdsFromRows,
  createDraftMappingRow,
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
