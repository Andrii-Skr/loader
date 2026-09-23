import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus, TaxCoverageStatus } from "@/generated/prisma/client";

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
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { selectInvoiceDocumentVersion } from "@/lib/documents/revisions";

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
