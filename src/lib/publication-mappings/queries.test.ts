import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  publicationIssueFindMany: vi.fn(),
  publicationIssueFindUnique: vi.fn(),
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
      groupBy: prismaMocks.specialDocumentGroupBy,
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
    prismaMocks.specialDocumentGroupBy.mockReset();
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([]);
    getExactCandidateCountsMock.mockReset();
    getExactCandidateCountsMock.mockResolvedValue(new Map());
  });

  it("does not scope the global unmatched filter to the document context", async () => {
    await getPublicationIssueRegistry("unmatched", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
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

  it("does not scope the global all filter to the document context", async () => {
    await getPublicationIssueRegistry("all", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
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
              lineItems: true,
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

  it("keeps rows without issue-number candidates out of the matched tab", async () => {
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
            issueNumberCandidateCount: 0,
          },
        ],
      ]),
    );
    prismaMocks.specialDocumentGroupBy.mockResolvedValue([]);

    await expect(getPublicationIssueRegistry("matched")).resolves.toEqual([]);
    await expect(getPublicationIssueRegistry("unmatched")).resolves.toEqual([
      expect.objectContaining({
        publicationIssueId: 11,
        hasConfirmedDocumentMatch: false,
        fullyMatched: false,
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
