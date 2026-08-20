import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const specialDocumentFindManyMock = vi.hoisted(() => vi.fn());
const deleteManyMock = vi.hoisted(() => vi.fn());
const createManyMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const applyPublicationMappingReplacementsMock = vi.hoisted(() => vi.fn());
const preparePublicationMappingReplacementMock = vi.hoisted(() => vi.fn());
const getExternalIssuePairsByIdsMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    specialDocument: { findMany: specialDocumentFindManyMock },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        specialDocumentExternalMatch: {
          deleteMany: deleteManyMock,
          createMany: createManyMock,
        },
        specialDocument: { update: updateMock },
      }),
    ),
  },
}));
vi.mock("@/lib/publication-mappings/external-repository", () => ({
  getExternalIssuePairsByIds: getExternalIssuePairsByIdsMock,
  searchExternalEditions: vi.fn(),
  searchExternalIssueNumbersByEdition: vi.fn(),
}));
vi.mock("@/lib/publication-mappings/queries", () => ({
  getPublicationIssueOccurrences: vi.fn(),
}));
vi.mock("@/lib/publication-mappings/service", () => ({
  applyPublicationMappingReplacements: applyPublicationMappingReplacementsMock,
  preparePublicationMappingReplacement: preparePublicationMappingReplacementMock,
  searchIssueNumberCandidates: vi.fn(),
  searchPublicationCandidates: vi.fn(),
}));

import {
  saveDocumentLineAllocations,
  savePublicationIssueMappingRegistry,
} from "@/app/actions/publication-issue-mappings";

const createInput = (
  details: Array<{ quantity: string; externalIssueId: number; externalEditionId?: number }> = [],
) => ({
  locale: "ru",
  documentId: 10,
  allocations: [
    {
      specialDocumentId: 20,
      matchDetails: details.map((detail, index) => ({
        externalEditionId: detail.externalEditionId ?? index + 1,
        externalEditionName: `Edition ${detail.externalEditionId ?? index + 1}`,
        externalIssueId: detail.externalIssueId,
        externalIssueNumber: `№${detail.externalIssueId}`,
        quantity: detail.quantity,
        unitPrice: "2.00",
      })),
    },
  ],
});

describe("saveDocumentLineAllocations", () => {
  beforeEach(() => {
    authMock.mockReset();
    revalidatePathMock.mockReset();
    specialDocumentFindManyMock.mockReset();
    deleteManyMock.mockReset();
    createManyMock.mockReset();
    updateMock.mockReset();
    applyPublicationMappingReplacementsMock.mockReset();
    preparePublicationMappingReplacementMock.mockReset();
    getExternalIssuePairsByIdsMock.mockReset();
    authMock.mockResolvedValue({ user: { role: "OPERATOR" } });
    preparePublicationMappingReplacementMock.mockResolvedValue({
      publicationId: 3,
      externalEditions: [],
    });
    getExternalIssuePairsByIdsMock.mockImplementation(
      async (pairs: Array<{ externalEditionId: number; externalIssueId: number }>) =>
        pairs.map((pair) => ({
          ...pair,
          externalEditionName: `Canonical edition ${pair.externalEditionId}`,
          externalIssueNumber: `Canonical issue ${pair.externalIssueId}`,
        })),
    );
    specialDocumentFindManyMock.mockResolvedValue([
      {
        id: 20,
        quantity: new Prisma.Decimal("1150"),
        vatRate: "20",
        document: { currency: "UAH" },
        _count: { externalMatches: 0 },
      },
    ]);
  });

  it("saves a complete split and calculates amounts from quantity and price", async () => {
    const result = await saveDocumentLineAllocations(
      createInput([
        { quantity: "100", externalIssueId: 101 },
        { quantity: "200", externalIssueId: 102 },
        { quantity: "850", externalIssueId: 103 },
      ]),
    );

    expect(result).toEqual({ errorKey: null });
    expect(createManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            quantity: expect.objectContaining({ toString: expect.any(Function) }),
            unitPrice: expect.objectContaining({ toString: expect.any(Function) }),
            lineBaseAmount: expect.objectContaining({ toString: expect.any(Function) }),
            lineVatAmount: expect.objectContaining({ toString: expect.any(Function) }),
            lineTotalAmount: expect.objectContaining({ toString: expect.any(Function) }),
            isPrimary: true,
          }),
        ]),
      }),
    );
  });

  it.each([
    ["under-allocation", [{ quantity: "100", externalIssueId: 101 }]],
    ["over-allocation", [{ quantity: "1151", externalIssueId: 101 }]],
    ["zero quantity", [{ quantity: "0", externalIssueId: 101 }]],
    [
      "duplicate target",
      [
        { quantity: "100", externalIssueId: 101, externalEditionId: 1 },
        { quantity: "1050", externalIssueId: 101, externalEditionId: 1 },
      ],
    ],
  ])("rejects %s", async (_label, details) => {
    await expect(saveDocumentLineAllocations(createInput(details))).resolves.toEqual({
      errorKey: "validationFailed",
    });
    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("clears an existing allocation when its details are empty", async () => {
    await expect(saveDocumentLineAllocations(createInput([]))).resolves.toEqual({ errorKey: null });

    expect(deleteManyMock).toHaveBeenCalledWith({ where: { specialDocumentId: 20 } });
    expect(createManyMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publicationIssueConfirmedAt: null,
          matchedExternalEditionId: null,
          matchedExternalIssueId: null,
          matchedExternalIssueNumber: null,
          externalMatchCount: 0,
          hasMultipleExternalMatches: false,
        }),
      }),
    );
  });

  it("rejects an edition and issue pair absent from the external directory", async () => {
    getExternalIssuePairsByIdsMock.mockResolvedValue([]);

    await expect(
      saveDocumentLineAllocations(createInput([{ quantity: "1150", externalIssueId: 101 }])),
    ).resolves.toEqual({ errorKey: "validationFailed" });

    expect(createManyMock).not.toHaveBeenCalled();
  });

  it("persists canonical external labels instead of client-provided labels", async () => {
    await expect(
      saveDocumentLineAllocations(createInput([{ quantity: "1150", externalIssueId: 101 }])),
    ).resolves.toEqual({ errorKey: null });

    expect(createManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            externalEditionName: "Canonical edition 1",
            externalIssueNumber: "Canonical issue 101",
          }),
        ]),
      }),
    );
  });

  it("does not write publication mappings when issue-match validation fails", async () => {
    await expect(
      savePublicationIssueMappingRegistry({
        locale: "ru",
        documentId: 10,
        publicationSelections: [{ publicationId: 3, selectionIds: [1] }],
        issueMatches: [
          {
            publicationIssueId: 4,
            matchedIssue: null,
            matchDetails: [
              {
                externalEditionId: 1,
                externalEditionName: "Edition 1",
                externalIssueId: 101,
                externalIssueNumber: "№101",
                quantity: "1",
                unitPrice: "2",
                lineBaseAmount: "2",
                lineVatAmount: "0",
                lineTotalAmount: "2",
                currency: "UAH",
                isPrimary: true,
              },
            ],
          },
        ],
      }),
    ).resolves.toEqual({ errorKey: "validationFailed" });

    expect(applyPublicationMappingReplacementsMock).not.toHaveBeenCalled();
  });

  it("stores match counts separately for every document line", async () => {
    specialDocumentFindManyMock.mockResolvedValue([
      {
        id: 20,
        quantity: new Prisma.Decimal("10"),
        unitPrice: new Prisma.Decimal("2"),
        lineBaseAmount: new Prisma.Decimal("20"),
        lineVatAmount: new Prisma.Decimal("4"),
        lineTotalAmount: new Prisma.Decimal("24"),
        document: { currency: "EUR" },
        _count: { externalMatches: 0 },
      },
      {
        id: 21,
        quantity: new Prisma.Decimal("5"),
        unitPrice: new Prisma.Decimal("2"),
        lineBaseAmount: new Prisma.Decimal("10"),
        lineVatAmount: new Prisma.Decimal("2"),
        lineTotalAmount: new Prisma.Decimal("12"),
        document: { currency: "EUR" },
        _count: { externalMatches: 0 },
      },
    ]);

    await expect(
      savePublicationIssueMappingRegistry({
        locale: "ru",
        documentId: 10,
        publicationSelections: [],
        issueMatches: [
          {
            publicationIssueId: 4,
            matchedIssue: {
              externalEditionId: 1,
              externalEditionName: "Edition 1",
              externalIssueId: 101,
              externalIssueNumber: "№101",
            },
          },
        ],
      }),
    ).resolves.toEqual({ errorKey: null });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20 },
        data: expect.objectContaining({ externalMatchCount: 1, hasMultipleExternalMatches: false }),
      }),
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 21 },
        data: expect.objectContaining({ externalMatchCount: 1, hasMultipleExternalMatches: false }),
      }),
    );
    expect(createManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ currency: "EUR" })]),
      }),
    );
  });

  it("preserves existing allocations during a standard registry save", async () => {
    specialDocumentFindManyMock.mockResolvedValue([
      {
        id: 20,
        quantity: new Prisma.Decimal("10"),
        unitPrice: new Prisma.Decimal("2"),
        lineBaseAmount: new Prisma.Decimal("20"),
        lineVatAmount: new Prisma.Decimal("4"),
        lineTotalAmount: new Prisma.Decimal("24"),
        document: { currency: "UAH" },
        _count: { externalMatches: 2 },
      },
      {
        id: 21,
        quantity: new Prisma.Decimal("5"),
        unitPrice: new Prisma.Decimal("2"),
        lineBaseAmount: new Prisma.Decimal("10"),
        lineVatAmount: new Prisma.Decimal("2"),
        lineTotalAmount: new Prisma.Decimal("12"),
        document: { currency: "UAH" },
        _count: { externalMatches: 1 },
      },
    ]);

    await expect(
      savePublicationIssueMappingRegistry({
        locale: "ru",
        documentId: 10,
        publicationSelections: [],
        issueMatches: [
          {
            publicationIssueId: 4,
            matchedIssue: {
              externalEditionId: 1,
              externalEditionName: "Edition 1",
              externalIssueId: 101,
              externalIssueNumber: "№101",
            },
          },
        ],
      }),
    ).resolves.toEqual({ errorKey: null });

    expect(deleteManyMock).not.toHaveBeenCalled();
    expect(createManyMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
