import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus, Prisma, TaxCoverageStatus } from "@/generated/prisma/client";

const tx = vi.hoisted(() => ({
  document: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  documentTaxCoverage: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  specialDocument: { findMany: vi.fn(), update: vi.fn() },
  specialDocumentExternalMatch: { create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    specialDocument: tx.specialDocument,
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { copyDocumentIssueMappings, selectInvoiceDocumentVersion } from "@/lib/documents/revisions";

const selectedDocument = {
  id: 20,
  documentTypeId: 2,
  extractionStatus: DocumentStatus.PROCESSED,
  documentContour: "UA",
  documentNumber: "12",
  documentDate: new Date("2026-04-10T00:00:00.000Z"),
  supplierId: 1,
  recipientId: null,
};

describe("selectInvoiceDocumentVersion", () => {
  beforeEach(() => {
    for (const group of Object.values(tx)) {
      for (const mock of Object.values(group)) {
        mock.mockReset();
      }
    }
    tx.document.findMany.mockResolvedValue([{ id: 20, isCurrent: false }]);
    tx.documentTaxCoverage.findMany.mockResolvedValue([]);
  });

  it("rejects a failed invoice version before changing its group", async () => {
    tx.document.findUnique.mockResolvedValue({
      ...selectedDocument,
      extractionStatus: DocumentStatus.FAILED,
    });

    await expect(selectInvoiceDocumentVersion({ documentId: 20 })).rejects.toThrow(
      "Invoice version was not found.",
    );
    expect(tx.document.findMany).not.toHaveBeenCalled();
    expect(tx.document.update).not.toHaveBeenCalled();
  });

  it("restores a processed version when the group has no current invoice", async () => {
    tx.document.findUnique.mockResolvedValue(selectedDocument);

    await expect(selectInvoiceDocumentVersion({ documentId: 20 })).resolves.toEqual({
      taxInvoiceDocumentIds: [],
    });
    expect(tx.document.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { isCurrent: true },
    });
  });

  it("clears affected tax invoice statuses in the version-switch transaction", async () => {
    tx.document.findUnique.mockResolvedValue(selectedDocument);
    tx.documentTaxCoverage.findMany.mockResolvedValue([{ taxInvoiceDocumentId: 41 }]);

    await expect(selectInvoiceDocumentVersion({ documentId: 20 })).resolves.toEqual({
      taxInvoiceDocumentIds: [41],
    });
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [41] }, documentTypeId: 1, isCurrent: true },
      data: { taxCoverageStatus: TaxCoverageStatus.NEEDS_SELECTION },
    });
  });
});

describe("copyDocumentIssueMappings", () => {
  const match = {
    externalEditionId: 1,
    externalEditionName: "Edition",
    externalIssueId: 101,
    externalIssueNumber: "101",
  };
  const single = {
    publicationIssueId: 5,
    _count: { externalMatches: 1 },
    externalMatches: [match],
  };
  const split = { ...single, _count: { externalMatches: 2 } };
  const target = {
    id: 30,
    publicationIssueId: 5,
    quantity: new Prisma.Decimal(10),
    unitPrice: new Prisma.Decimal(2),
    lineBaseAmount: new Prisma.Decimal(20),
    lineVatAmount: new Prisma.Decimal(4),
    lineTotalAmount: new Prisma.Decimal(24),
    document: { currency: "UAH" },
  };
  beforeEach(() => {
    tx.specialDocument.findMany.mockReset();
    tx.specialDocument.update.mockReset();
    tx.specialDocumentExternalMatch.create.mockReset();
  });
  it.each([
    [single, split],
    [split, single],
  ])("does not copy a mixed single and split issue regardless of order", async (first, second) => {
    tx.specialDocument.findMany.mockResolvedValueOnce([first, second]);
    expect(await copyDocumentIssueMappings({ sourceDocumentId: 10, targetDocumentId: 11 })).toBe(0);
    expect(tx.specialDocument.findMany).toHaveBeenCalledTimes(1);
    expect(tx.specialDocumentExternalMatch.create).not.toHaveBeenCalled();
  });
  it("blocks an incomplete confirmed match instead of copying another row of the same issue", async () => {
    tx.specialDocument.findMany.mockResolvedValueOnce([single, { ...single, externalMatches: [] }]);
    expect(await copyDocumentIssueMappings({ sourceDocumentId: 10, targetDocumentId: 11 })).toBe(0);
    expect(tx.specialDocumentExternalMatch.create).not.toHaveBeenCalled();
  });
  it("still copies an unambiguous selection using the new line quantities and amounts", async () => {
    tx.specialDocument.findMany
      .mockResolvedValueOnce([single, single])
      .mockResolvedValueOnce([target]);
    expect(await copyDocumentIssueMappings({ sourceDocumentId: 10, targetDocumentId: 11 })).toBe(1);
    expect(tx.specialDocumentExternalMatch.create).toHaveBeenCalledWith({
      data: {
        specialDocumentId: 30,
        ...match,
        quantity: target.quantity,
        unitPrice: target.unitPrice,
        lineBaseAmount: target.lineBaseAmount,
        lineVatAmount: target.lineVatAmount,
        lineTotalAmount: target.lineTotalAmount,
        currency: "UAH",
        isPrimary: true,
      },
    });
  });
});
