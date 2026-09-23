import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  publicationIssueFindMany: vi.fn(),
  publicationIssueFindUnique: vi.fn(),
  specialDocumentExternalMatchFindMany: vi.fn(),
  specialDocumentFindMany: vi.fn(),
  specialDocumentGroupBy: vi.fn(),
}));

const getExactCandidateCountsMock = vi.hoisted(() => vi.fn(async () => new Map()));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicationIssue: {
      findMany: prismaMocks.publicationIssueFindMany,
      findUnique: prismaMocks.publicationIssueFindUnique,
    },
    specialDocument: {
      findMany: prismaMocks.specialDocumentFindMany,
      groupBy: prismaMocks.specialDocumentGroupBy,
    },
    specialDocumentExternalMatch: {
      findMany: prismaMocks.specialDocumentExternalMatchFindMany,
    },
  },
}));

vi.mock("@/lib/publication-mappings/service", () => ({
  getExactCandidateCounts: getExactCandidateCountsMock,
}));

import {
  getPublicationIssueOccurrences,
  getPublicationIssueRegistry,
} from "@/lib/publication-mappings/queries";

describe("getPublicationIssueRegistry", () => {
  beforeEach(() => {
    prismaMocks.publicationIssueFindMany.mockReset();
    prismaMocks.publicationIssueFindMany.mockResolvedValue([]);
    prismaMocks.publicationIssueFindUnique.mockReset();
    prismaMocks.publicationIssueFindUnique.mockResolvedValue(null);
    prismaMocks.specialDocumentExternalMatchFindMany.mockReset();
    prismaMocks.specialDocumentExternalMatchFindMany.mockResolvedValue([]);
    prismaMocks.specialDocumentFindMany.mockReset();
    prismaMocks.specialDocumentFindMany.mockResolvedValue([]);
    prismaMocks.specialDocumentGroupBy.mockReset();
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([]);
    getExactCandidateCountsMock.mockReset();
    getExactCandidateCountsMock.mockResolvedValue(new Map());
  });

  it("keeps the global unmatched filter on current documents, not the selected document", async () => {
    await getPublicationIssueRegistry("unmatched", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineItems: {
            some: {
              document: { isCurrent: true },
            },
          },
        },
      }),
    );
  });

  it("scopes the document-unmatched filter to the selected document", async () => {
    await getPublicationIssueRegistry("document-unmatched", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineItems: {
            some: {
              documentId: 42,
            },
          },
        },
      }),
    );
  });

  it("keeps the global all filter on current documents, not the selected document", async () => {
    await getPublicationIssueRegistry("all", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineItems: {
            some: {
              document: { isCurrent: true },
            },
          },
        },
      }),
    );
  });

  it("limits document occurrences loaded for each registry row", async () => {
    await getPublicationIssueRegistry("all");

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          _count: {
            select: {
              lineItems: {
                where: {
                  document: { isCurrent: true },
                },
              },
            },
          },
          lineItems: expect.objectContaining({
            take: 10,
          }),
        }),
      }),
    );
  });

  it("returns document occurrences for the exact publication issue combination", async () => {
    prismaMocks.publicationIssueFindMany.mockResolvedValue([
      {
        id: 11,
        _count: {
          lineItems: 12,
        },
        publication: {
          id: 3,
          displayName: "Філворди",
          mappings: [],
        },
        issueNumber: {
          id: 4,
          rawValue: "4-26",
          canonicalValue: "04-26",
        },
        lineItems: [
          {
            description: "Філворди №04-26",
            rawRowText: "Філворди.Спецвипуск №04/26",
            document: {
              documentNumber: "A-17",
              sourceFileName: "invoice-a.pdf",
            },
          },
          {
            description: "Філворди №04-26",
            rawRowText: "Філворди №04-26",
            document: {
              documentNumber: null,
              sourceFileName: "invoice-b.pdf",
            },
          },
        ],
      },
    ]);
    getExactCandidateCountsMock.mockResolvedValue(
      new Map([
        [
          11,
          {
            publicationCandidateCount: 2,
            issueNumberCandidateCount: 0,
          },
        ],
      ]),
    );

    await expect(getPublicationIssueRegistry("all")).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        parsedIssueNumber: "4-26",
        canonicalIssueNumber: "04-26",
        publicationCandidateCount: 2,
        issueNumberCandidateCount: 0,
        hasConfirmedDocumentMatch: false,
        documentOccurrenceCount: 12,
        hasMultipleDocumentIssueMatches: false,
        documentIssueMatchCount: 0,
        savedDocumentIssueMatchDetails: [],
        documentOccurrences: [
          {
            documentNumber: "A-17",
            sourceFileName: "invoice-a.pdf",
            description: "Філворди №04-26",
            rawRowText: "Філворди.Спецвипуск №04/26",
          },
          {
            documentNumber: null,
            sourceFileName: "invoice-b.pdf",
            description: "Філворди №04-26",
            rawRowText: "Філворди №04-26",
          },
        ],
      }),
    ]);
  });

  it("requires a confirmed mapping in every document occurrence", async () => {
    prismaMocks.publicationIssueFindMany.mockResolvedValue([
      {
        id: 11,
        _count: { lineItems: 1 },
        publication: {
          id: 3,
          displayName: "Філворди",
          mappings: [
            {
              id: 1,
              externalEditionId: 7,
              externalEditionName: "Філворди",
              source: { code: "idz-ukr", displayName: "IDZ-UKR" },
            },
          ],
        },
        issueNumber: {
          id: 4,
          rawValue: "4",
          canonicalValue: "04-26",
        },
        lineItems: [],
      },
      {
        id: 12,
        _count: { lineItems: 2 },
        publication: {
          id: 4,
          displayName: "Банзай",
          mappings: [
            {
              id: 2,
              externalEditionId: 8,
              externalEditionName: "Банзай",
              source: { code: "idz-ukr", displayName: "IDZ-UKR" },
            },
          ],
        },
        issueNumber: {
          id: 4,
          rawValue: "4",
          canonicalValue: "04-26",
        },
        lineItems: [],
      },
    ]);
    getExactCandidateCountsMock.mockResolvedValue(
      new Map([
        [
          11,
          {
            publicationCandidateCount: 1,
            issueNumberCandidateCount: 0,
          },
        ],
        [
          12,
          {
            publicationCandidateCount: 1,
            issueNumberCandidateCount: 0,
          },
        ],
      ]),
    );
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([
      {
        publicationIssueId: 11,
        _count: { _all: 1 },
      },
      {
        publicationIssueId: 12,
        _count: { _all: 1 },
      },
    ]);
    prismaMocks.specialDocumentFindMany.mockResolvedValue([
      {
        publicationIssueId: 12,
        documentId: 55,
      },
    ]);

    await expect(getPublicationIssueRegistry("matched")).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        hasConfirmedDocumentMatch: true,
        fullyMatched: true,
        hasMultipleDocumentIssueMatches: false,
        documentIssueMatchCount: 0,
      }),
    ]);
    await expect(getPublicationIssueRegistry("unmatched")).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 12,
        fullyMatched: false,
        mappingDocumentId: 55,
      }),
    ]);
  });

  it("accepts a confirmed document match even when the issue text is not an exact candidate", async () => {
    prismaMocks.publicationIssueFindMany.mockResolvedValue([
      {
        id: 11,
        _count: { lineItems: 1 },
        publication: {
          id: 3,
          displayName: "Філворди",
          mappings: [
            {
              id: 1,
              externalEditionId: 7,
              externalEditionName: "Філворди",
              source: { code: "idz-ukr", displayName: "IDZ-UKR" },
            },
          ],
        },
        issueNumber: {
          id: 4,
          rawValue: "4 (том 27)",
          canonicalValue: "04-26",
        },
        lineItems: [],
      },
    ]);
    getExactCandidateCountsMock.mockResolvedValue(
      new Map([
        [
          11,
          {
            publicationCandidateCount: 1,
            issueNumberCandidateCount: 0,
          },
        ],
      ]),
    );
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([
      {
        publicationIssueId: 11,
        _count: { _all: 1 },
      },
    ]);

    await expect(getPublicationIssueRegistry("matched", 42)).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        hasConfirmedDocumentMatch: true,
        fullyMatched: true,
      }),
    ]);
  });

  it("keeps matched rows only when the selected document has confirmed issue numbers", async () => {
    prismaMocks.publicationIssueFindMany.mockResolvedValue([
      {
        id: 11,
        _count: { lineItems: 1 },
        publication: {
          id: 3,
          displayName: "Філворди",
          mappings: [
            {
              id: 1,
              externalEditionId: 7,
              externalEditionName: "Філворди",
              source: { code: "idz-ukr", displayName: "IDZ-UKR" },
            },
          ],
        },
        issueNumber: {
          id: 4,
          rawValue: "4",
          canonicalValue: "04-26",
        },
        lineItems: [],
      },
    ]);
    getExactCandidateCountsMock.mockResolvedValue(
      new Map([
        [
          11,
          {
            publicationCandidateCount: 1,
            issueNumberCandidateCount: 1,
          },
        ],
      ]),
    );
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([
      {
        publicationIssueId: 11,
        _count: { _all: 1 },
      },
    ]);

    await expect(getPublicationIssueRegistry("matched", 42)).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        hasConfirmedDocumentMatch: true,
        fullyMatched: true,
      }),
    ]);
  });

  it("returns the saved external issue match for the selected document", async () => {
    prismaMocks.publicationIssueFindMany.mockResolvedValue([
      {
        id: 11,
        _count: { lineItems: 1 },
        publication: {
          id: 3,
          displayName: "Філворди",
          mappings: [
            {
              id: 1,
              externalEditionId: 7,
              externalEditionName: "Філворди",
              source: { code: "idz-ukr", displayName: "IDZ-UKR" },
            },
          ],
        },
        issueNumber: {
          id: 4,
          rawValue: "4",
          canonicalValue: "04-26",
        },
        lineItems: [],
      },
    ]);
    prismaMocks.specialDocumentFindMany.mockResolvedValue([
      {
        publicationIssueId: 11,
        matchedExternalEditionId: 7,
        matchedExternalIssueId: 101,
        matchedExternalIssueNumber: "04-26",
      },
    ]);
    prismaMocks.specialDocumentExternalMatchFindMany.mockResolvedValue([
      {
        externalEditionId: 7,
        externalEditionName: "Філворди",
        externalIssueId: 101,
        externalIssueNumber: "04-26",
        quantity: { toString: () => "1000" },
        unitPrice: { toString: () => "5.00" },
        lineBaseAmount: { toString: () => "5000.00" },
        lineVatAmount: { toString: () => "1000.00" },
        lineTotalAmount: { toString: () => "6000.00" },
        currency: "UAH",
        isPrimary: true,
        specialDocument: {
          publicationIssueId: 11,
        },
      },
    ]);

    await expect(getPublicationIssueRegistry("all", 42)).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        hasMultipleDocumentIssueMatches: false,
        documentIssueMatchCount: 1,
        savedDocumentIssueMatch: {
          externalEditionId: 7,
          externalIssueId: 101,
          externalIssueNumber: "04-26",
        },
        savedDocumentIssueMatchDetails: [
          {
            externalEditionId: 7,
            externalEditionName: "Філворди",
            externalIssueId: 101,
            externalIssueNumber: "04-26",
            quantity: "1000",
            unitPrice: "5.00",
            lineBaseAmount: "5000.00",
            lineVatAmount: "1000.00",
            lineTotalAmount: "6000.00",
            currency: "UAH",
            isPrimary: true,
          },
        ],
      }),
    ]);
  });
});

describe("getPublicationIssueOccurrences", () => {
  beforeEach(() => {
    prismaMocks.publicationIssueFindUnique.mockReset();
    prismaMocks.publicationIssueFindUnique.mockResolvedValue(null);
  });

  it("returns all occurrences for the selected publication issue", async () => {
    prismaMocks.publicationIssueFindUnique.mockResolvedValue({
      lineItems: [
        {
          description: "Філворди №04-26",
          rawRowText: "Філворди.Спецвипуск №04/26",
          document: {
            documentNumber: "A-17",
            sourceFileName: "invoice-a.pdf",
          },
        },
        {
          description: "Філворди №04-26",
          rawRowText: "Філворди №04-26",
          document: {
            documentNumber: null,
            sourceFileName: "invoice-b.pdf",
          },
        },
      ],
    });

    await expect(getPublicationIssueOccurrences(11)).resolves.toEqual([
      {
        documentNumber: "A-17",
        sourceFileName: "invoice-a.pdf",
        description: "Філворди №04-26",
        rawRowText: "Філворди.Спецвипуск №04/26",
      },
      {
        documentNumber: null,
        sourceFileName: "invoice-b.pdf",
        description: "Філворди №04-26",
        rawRowText: "Філворди №04-26",
      },
    ]);
    expect(prismaMocks.publicationIssueFindUnique).toHaveBeenCalledWith({
      where: { id: 11 },
      select: {
        lineItems: {
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            description: true,
            rawRowText: true,
            document: {
              select: {
                documentNumber: true,
                sourceFileName: true,
              },
            },
          },
        },
      },
    });
  });
});
