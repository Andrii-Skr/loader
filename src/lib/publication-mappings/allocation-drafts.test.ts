import { describe, expect, it } from "vitest";

import { allocationDraftsSchema, getExcludedAllocationIssueIds } from "./allocation-drafts";

const complete = {
  externalEditionId: 11,
  externalEditionName: "Edition",
  externalIssueId: 42,
  externalIssueNumber: "4",
  quantity: "100",
  unitPrice: "1.25",
};
const blank = { ...complete, externalEditionId: null, externalIssueId: null };
const schema = allocationDraftsSchema("Complete the selection");

describe("allocationDraftsSchema", () => {
  it("allows different issues of the same edition and excludes only the occupied pair", () => {
    const first = { ...complete, rowId: "first" };
    const second = { ...complete, rowId: "second", externalIssueId: 43 };
    expect(schema.safeParse([{ specialDocumentId: 1, drafts: [first, second] }]).success).toBe(
      true,
    );
    expect(
      getExcludedAllocationIssueIds([first, second], "second", first.externalEditionId),
    ).toEqual(new Set([42]));
    expect(getExcludedAllocationIssueIds([first, second], "second", 12)).toEqual(new Set());
  });
  it("rejects changing the edition without choosing a replacement issue", () => {
    const result = schema.safeParse([
      {
        specialDocumentId: 1,
        drafts: [{ ...complete, externalEditionId: 12, externalIssueId: null }],
      },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Complete the selection");
    }
  });

  it("rejects a blank split row rather than silently discarding it", () => {
    expect(schema.safeParse([{ specialDocumentId: 1, drafts: [complete, blank] }]).success).toBe(
      false,
    );
  });

  it("rejects the entire batch if any line has an incomplete selection", () => {
    expect(
      schema.safeParse([
        { specialDocumentId: 1, drafts: [complete] },
        { specialDocumentId: 2, drafts: [{ ...complete, externalIssueId: null }] },
      ]).success,
    ).toBe(false);
  });

  it("preserves every completed split allocation in the save payload", () => {
    const second = { ...complete, externalIssueId: 43, externalIssueNumber: "5", quantity: "20" };
    expect(schema.parse([{ specialDocumentId: 1, drafts: [complete, second] }])).toEqual([
      { specialDocumentId: 1, matchDetails: [complete, second] },
    ]);
  });

  it("allows a single fully cleared selection to remove a mapping", () => {
    expect(schema.parse([{ specialDocumentId: 1, drafts: [blank] }])).toEqual([
      { specialDocumentId: 1, matchDetails: [] },
    ]);
  });

  it("rejects an over-precision price with the translated validation message", () => {
    const result = allocationDraftsSchema("Complete the selection", "Invalid price").safeParse([
      { specialDocumentId: 1, drafts: [{ ...complete, unitPrice: "1.255" }] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Invalid price");
  });
});
