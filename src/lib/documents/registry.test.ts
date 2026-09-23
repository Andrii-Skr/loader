import { describe, expect, it } from "vitest";

import { getDocumentMappingStatus } from "@/lib/documents/mapping-status";
import {
  calculateRegistryMoneyTotals,
  formatRegistryMoneyTotals,
  formatRegistryMonthLabel,
  getRegistryReconciliationPath,
  splitRegistryDocuments,
} from "@/lib/documents/registry";

describe("registry money totals", () => {
  it("adds document amounts by currency and excludes missing amounts", () => {
    expect(
      calculateRegistryMoneyTotals([
        { totalAmountRaw: "120.25", currency: "UAH" },
        { totalAmountRaw: "79.75", currency: "UAH" },
        { totalAmountRaw: "50.00", currency: "RUB" },
        { totalAmountRaw: null, currency: "UAH" },
      ]),
    ).toEqual([
      { currency: "RUB", amountMinor: 5000n },
      { currency: "UAH", amountMinor: 20000n },
    ]);
  });

  it("retains precision when the summed amount exceeds JavaScript number precision", () => {
    expect(
      calculateRegistryMoneyTotals([
        { totalAmountRaw: "999999999999999.99", currency: "UAH" },
        { totalAmountRaw: "0.01", currency: "UAH" },
      ]),
    ).toEqual([{ currency: "UAH", amountMinor: 100000000000000000n }]);
  });

  it("returns no totals for documents without a known amount", () => {
    expect(
      formatRegistryMoneyTotals({
        documents: [{ totalAmountRaw: null, currency: "UAH" }],
        locale: "ru",
      }),
    ).toEqual([]);
  });

  it("formats separate currency totals for the selected locale", () => {
    expect(
      formatRegistryMoneyTotals({
        documents: [
          { totalAmountRaw: "12.50", currency: "UAH" },
          { totalAmountRaw: "7.50", currency: "UAH" },
          { totalAmountRaw: "10.00", currency: "RUB" },
        ],
        locale: "en",
      }),
    ).toEqual(["10.00 ₽", "20.00 ₴"]);
  });

  it("uses a stable locale-specific separator for server and client rendering", () => {
    expect(
      formatRegistryMoneyTotals({
        documents: [{ totalAmountRaw: "1234.50", currency: "UAH" }],
        locale: "uk",
      }),
    ).toEqual(["1 234,50 ₴"]);
  });
});

describe("formatRegistryMonthLabel", () => {
  it("formats month and year without locale-specific year suffixes", () => {
    const label = formatRegistryMonthLabel("ru", new Date(Date.UTC(2026, 5, 10)));

    expect(label).toBe("июнь 2026");
  });
});

describe("getRegistryReconciliationPath", () => {
  it("links a dated group to its monthly reconciliation and excludes undated documents", () => {
    expect(getRegistryReconciliationPath("2026-04")).toBe("/dashboard/reconciliation/2026-04");
    expect(getRegistryReconciliationPath("undated")).toBeNull();
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
          publicationIssueConfirmedAt: null,
          publicationIssue: null,
        },
        {
          publicationIssueConfirmedAt: null,
          publicationIssue: {
            publication: { _count: { mappings: 0 } },
          },
        },
      ]),
    ).toBe("unparsed");
  });

  it("treats mapped-but-unconfirmed rows as partially matched", () => {
    expect(
      getDocumentMappingStatus([
        {
          publicationIssueConfirmedAt: null,
          publicationIssue: {
            publication: { _count: { mappings: 1 } },
          },
        },
      ]),
    ).toBe("partiallyMatched");
  });

  it("keeps legacy confirmations without external matches actionable", () => {
    expect(
      getDocumentMappingStatus([
        {
          publicationIssueConfirmedAt: new Date("2026-07-22T00:00:00.000Z"),
          externalMatchCount: 0,
          publicationIssue: {
            publication: { _count: { mappings: 1 } },
          },
        },
      ]),
    ).toBe("partiallyMatched");
  });
});
