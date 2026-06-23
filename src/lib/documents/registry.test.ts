import { describe, expect, it } from "vitest";

import { getDocumentMappingStatus } from "@/lib/documents/mapping-status";
import { formatRegistryMonthLabel, splitRegistryDocuments } from "@/lib/documents/registry";

describe("formatRegistryMonthLabel", () => {
  it("formats month and year without locale-specific year suffixes", () => {
    const label = formatRegistryMonthLabel("ru", new Date(Date.UTC(2026, 5, 10)));

    expect(label).toBe("июнь 2026");
  });
});

describe("splitRegistryDocuments", () => {
  it("keeps non-fully-matched documents in the actionable list", () => {
    const result = splitRegistryDocuments({
      documents: [
        {
          id: 1,
          label: "A",
          mappingStatus: "unmatched" as const,
          documentDate: new Date(Date.UTC(2026, 5, 10)),
        },
        {
          id: 2,
          label: "B",
          mappingStatus: "partiallyMatched" as const,
          documentDate: new Date(Date.UTC(2026, 4, 10)),
        },
        {
          id: 3,
          label: "C",
          mappingStatus: "fullyMatched" as const,
          documentDate: new Date(Date.UTC(2026, 4, 8)),
        },
      ],
      locale: "ru",
      undatedTitle: "Без даты документа",
    });

    expect(result.actionableDocuments).toEqual([
      { id: 1, label: "A", mappingStatus: "unmatched" },
      { id: 2, label: "B", mappingStatus: "partiallyMatched" },
    ]);
    expect(result.completedGroups).toHaveLength(1);
    expect(result.completedGroups[0]).toMatchObject({
      key: "2026-05",
      count: 1,
      documents: [{ id: 3, label: "C" }],
    });
  });

  it("groups fully matched documents by descending month and appends undated items last", () => {
    const result = splitRegistryDocuments({
      documents: [
        {
          id: 10,
          label: "June-1",
          mappingStatus: "fullyMatched" as const,
          documentDate: new Date(Date.UTC(2026, 5, 20)),
        },
        {
          id: 11,
          label: "May-1",
          mappingStatus: "fullyMatched" as const,
          documentDate: new Date(Date.UTC(2026, 4, 10)),
        },
        {
          id: 12,
          label: "June-2",
          mappingStatus: "fullyMatched" as const,
          documentDate: new Date(Date.UTC(2026, 5, 1)),
        },
        {
          id: 13,
          label: "Undated",
          mappingStatus: "fullyMatched" as const,
          documentDate: null,
        },
      ],
      locale: "ru",
      undatedTitle: "Без даты документа",
    });

    expect(result.completedGroups).toEqual([
      {
        key: "2026-06",
        title: "июнь 2026",
        count: 2,
        documents: [
          { id: 10, label: "June-1", mappingStatus: "fullyMatched" },
          { id: 12, label: "June-2", mappingStatus: "fullyMatched" },
        ],
      },
      {
        key: "2026-05",
        title: "май 2026",
        count: 1,
        documents: [{ id: 11, label: "May-1", mappingStatus: "fullyMatched" }],
      },
      {
        key: "undated",
        title: "Без даты документа",
        count: 1,
        documents: [{ id: 13, label: "Undated", mappingStatus: "fullyMatched" }],
      },
    ]);
  });
});

describe("getDocumentMappingStatus", () => {
  it("keeps unparsed status when at least one line item was not parsed", () => {
    expect(
      getDocumentMappingStatus([
        {
          publicationIssue: null,
        },
        {
          publicationIssue: {
            publication: { _count: { mappings: 0 } },
            issueNumber: { _count: { mappings: 0 } },
          },
        },
      ]),
    ).toBe("unparsed");
  });
});
