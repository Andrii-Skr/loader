import { describe, expect, it } from "vitest";

import { allocationDraftsSchema } from "./allocation-drafts";
import { createCollectionDrafts, normalizeCollectionKey } from "./collection-presets";
import type { CollectionPresetDto, DocumentLineAllocationDto } from "./types";

const preset: CollectionPresetDto = {
  id: 1,
  name: "Календар",
  unavailable: false,
  editions: [
    { externalEditionId: 2, externalEditionName: "First" },
    { externalEditionId: 3, externalEditionName: "Second" },
  ],
};
const line: DocumentLineAllocationDto = {
  specialDocumentId: 10,
  lineNo: 1,
  description: "Календар № 2",
  publicationIssueId: 5,
  quantity: "100",
  unitPrice: "3.50",
  vatRate: "20",
  lineBaseAmount: "350",
  lineVatAmount: "70",
  lineTotalAmount: "420",
  currency: "UAH",
  allocations: [],
  presetIssueCandidates: {
    2: [{ externalIssueId: 22, externalIssueNumber: "02-26", isExactMatch: true, score: 1 }],
    3: [{ externalIssueId: 33, externalIssueNumber: "01-26", isExactMatch: false, score: 0.9 }],
  },
};

describe("collection composition drafts", () => {
  it("matches case and whitespace only, preserving punctuation and distinct names", () => {
    expect(normalizeCollectionKey("  КАЛЕНДАР  збірник\n ")).toBe("календар збірник");
    expect(normalizeCollectionKey("Календар-2")).not.toBe(normalizeCollectionKey("Календар 2"));
  });

  it("uses current exact issue candidates and current price, with empty quantities", () => {
    const drafts = createCollectionDrafts(line, preset, "first");
    expect(
      drafts.map((draft) => [
        draft.externalEditionId,
        draft.externalIssueId,
        draft.quantity,
        draft.unitPrice,
      ]),
    ).toEqual([
      [2, 22, "", "3.50"],
      [3, null, "", "3.50"],
    ]);
    expect(
      createCollectionDrafts(
        {
          ...line,
          presetIssueCandidates: {
            2: [
              { externalIssueId: 24, externalIssueNumber: "03-26", isExactMatch: true, score: 1 },
            ],
          },
        },
        preset,
        "next",
      )[0].externalIssueId,
    ).toBe(24);
  });

  it("leaves issues empty without parsed issue context", () => {
    expect(
      createCollectionDrafts(
        { ...line, publicationIssueId: null, presetIssueCandidates: {} },
        preset,
        "raw",
      ).every((draft) => draft.externalIssueId === null),
    ).toBe(true);
  });

  it("does not overwrite saved allocations or apply an unavailable composition", () => {
    expect(
      createCollectionDrafts(
        {
          ...line,
          allocations: [
            { externalEditionId: 8 } as DocumentLineAllocationDto["allocations"][number],
          ],
        },
        preset,
        "saved",
      ),
    ).toEqual([]);
    expect(createCollectionDrafts(line, { ...preset, unavailable: true }, "missing")).toEqual([]);
  });

  it("blocks saving until quantities and issues are filled", () => {
    const drafts = createCollectionDrafts(line, preset, "new");
    const schema = allocationDraftsSchema("incomplete");
    const input = () => [{ specialDocumentId: 10, drafts }];
    expect(schema.safeParse(input()).success).toBe(false);
    for (const draft of drafts) draft.quantity = "50";
    expect(schema.safeParse(input()).success).toBe(false);
    drafts[1].externalIssueId = 34;
    expect(schema.safeParse(input()).success).toBe(true);
  });
});
