import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma, TaxCoverageStatus } from "@/generated/prisma/client";

const prismaState = vi.hoisted(() => ({
  documentFindUnique: vi.fn(),
  documentFindMany: vi.fn(),
  documentUpdate: vi.fn(),
}));

const transactionState = vi.hoisted(() => ({
  tx: {
    documentTaxCoverage: { findMany: vi.fn() },
    document: {
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: typeof transactionState.tx) => unknown) =>
      callback(transactionState.tx),
    ),
    document: {
      findUnique: prismaState.documentFindUnique,
      findMany: prismaState.documentFindMany,
      update: prismaState.documentUpdate,
    },
  },
}));

import {
  deleteDocumentWithCoverageRefresh,
  getTaxCoverageCandidates,
  rematchUncoveredTaxInvoicesForInvoice,
} from "@/lib/documents/tax-coverage";

describe("getTaxCoverageCandidates", () => {
  beforeEach(() => {
    prismaState.documentFindUnique.mockReset();
    prismaState.documentFindMany.mockReset();
    prismaState.documentUpdate.mockReset();
    transactionState.tx.documentTaxCoverage.findMany.mockReset();
    transactionState.tx.document.delete.mockReset();
    transactionState.tx.document.deleteMany.mockReset();
    transactionState.tx.document.findMany.mockReset();
    transactionState.tx.document.findUnique.mockReset();
    transactionState.tx.document.update.mockReset();
    transactionState.tx.document.updateMany.mockReset();
  });

  it("rechecks current uncovered tax invoices after an invoice is uploaded", async () => {
    prismaState.documentFindUnique
      .mockResolvedValueOnce({
        documentTypeId: 2,
        isCurrent: true,
        supplierId: 1,
        recipientId: 2,
      })
      .mockResolvedValueOnce({
        id: 10,
        documentTypeId: 1,
        isCurrent: true,
        supplierId: 1,
        recipientId: 2,
        lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
      });
    prismaState.documentFindMany.mockResolvedValueOnce([{ id: 10 }]).mockResolvedValueOnce([]);

    await rematchUncoveredTaxInvoicesForInvoice(20);

    expect(prismaState.documentFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          documentTypeId: 1,
          isCurrent: true,
          supplierId: 1,
          recipientId: 2,
          taxCoverageStatus: {
            in: [TaxCoverageStatus.NO_CANDIDATES, TaxCoverageStatus.NEEDS_SELECTION],
          },
        }),
      }),
    );
    expect(prismaState.documentUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { taxCoverageStatus: TaxCoverageStatus.NO_CANDIDATES },
    });
  });

  it("resets and rematches linked tax invoices when their invoice is deleted", async () => {
    transactionState.tx.document.findUnique.mockResolvedValue({
      id: 20,
      isCurrent: true,
      documentContour: null,
      sourceFilePath: null,
    });
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([
      {
        invoiceDocumentId: 20,
        taxInvoiceDocumentId: 10,
        taxInvoiceDocument: { isCurrent: true },
      },
    ]);
    transactionState.tx.document.delete.mockResolvedValue({ id: 20 });
    transactionState.tx.document.updateMany.mockResolvedValue({ count: 1 });
    prismaState.documentFindUnique.mockResolvedValue({
      id: 10,
      documentTypeId: 1,
      isCurrent: true,
      supplierId: 1,
      recipientId: 2,
      lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
    });
    prismaState.documentFindMany.mockResolvedValue([]);

    await deleteDocumentWithCoverageRefresh({ documentId: 20, documentTypeId: 2 });

    expect(transactionState.tx.document.delete).toHaveBeenCalledWith({ where: { id: 20 } });
    expect(transactionState.tx.document.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10] } },
      data: { taxCoverageStatus: TaxCoverageStatus.NO_CANDIDATES },
    });
    expect(prismaState.documentFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 } }),
    );
    expect(prismaState.documentUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { taxCoverageStatus: TaxCoverageStatus.NO_CANDIDATES },
    });
  });

  it("deletes every version when the current invoice is deleted", async () => {
    const documentDate = new Date("2026-04-02T00:00:00.000Z");
    transactionState.tx.document.findUnique.mockResolvedValue({
      id: 21,
      isCurrent: true,
      documentContour: "UA",
      documentNumber: "101",
      documentDate,
      supplierId: 7,
      sourceFilePath: "/tmp/current.pdf",
    });
    transactionState.tx.document.findMany.mockResolvedValue([
      { id: 20, isCurrent: false, sourceFilePath: "/tmp/previous.pdf" },
      { id: 21, isCurrent: true, sourceFilePath: "/tmp/current.pdf" },
    ]);
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([]);

    const paths = await deleteDocumentWithCoverageRefresh({ documentId: 21, documentTypeId: 2 });

    expect(transactionState.tx.document.findMany).toHaveBeenCalledWith({
      where: {
        documentTypeId: 2,
        documentContour: "UA",
        documentNumber: "101",
        documentDate,
        supplierId: 7,
      },
      select: { id: true, isCurrent: true, sourceFilePath: true },
    });
    expect(transactionState.tx.documentTaxCoverage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceDocumentId: { in: [20, 21] } } }),
    );
    expect(transactionState.tx.document.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [20, 21] } },
    });
    expect(paths).toEqual(["/tmp/previous.pdf", "/tmp/current.pdf"]);
  });

  it("deletes only the selected historical version while the current invoice remains", async () => {
    transactionState.tx.document.findUnique.mockResolvedValue({
      id: 20,
      isCurrent: false,
      documentContour: "UA",
      documentNumber: "101",
      documentDate: new Date("2026-04-02T00:00:00.000Z"),
      supplierId: 7,
      sourceFilePath: "/tmp/previous.pdf",
    });
    transactionState.tx.document.findMany.mockResolvedValue([
      { id: 20, isCurrent: false, sourceFilePath: "/tmp/previous.pdf" },
      { id: 21, isCurrent: true, sourceFilePath: "/tmp/current.pdf" },
    ]);
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([]);

    const paths = await deleteDocumentWithCoverageRefresh({ documentId: 20, documentTypeId: 2 });

    expect(transactionState.tx.document.delete).toHaveBeenCalledWith({ where: { id: 20 } });
    expect(transactionState.tx.document.deleteMany).not.toHaveBeenCalled();
    expect(paths).toEqual(["/tmp/previous.pdf"]);
  });

  it("deletes all versions of an already orphaned invoice", async () => {
    transactionState.tx.document.findUnique.mockResolvedValue({
      id: 20,
      isCurrent: false,
      documentContour: "UA",
      documentNumber: "101",
      documentDate: new Date("2026-04-02T00:00:00.000Z"),
      supplierId: 7,
      sourceFilePath: "/tmp/previous.pdf",
    });
    transactionState.tx.document.findMany.mockResolvedValue([
      { id: 19, isCurrent: false, sourceFilePath: null },
      { id: 20, isCurrent: false, sourceFilePath: "/tmp/previous.pdf" },
    ]);
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([]);

    await deleteDocumentWithCoverageRefresh({ documentId: 20, documentTypeId: 2 });

    expect(transactionState.tx.document.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [19, 20] } },
    });
  });

  it("recalculates the invoice flag when its linked tax invoice is deleted", async () => {
    transactionState.tx.document.findUnique
      .mockResolvedValueOnce({ id: 10, sourceFilePath: null })
      .mockResolvedValueOnce({
        lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
        invoiceCoverages: [],
      });
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([
      {
        invoiceDocumentId: 20,
        taxInvoiceDocumentId: 10,
        taxInvoiceDocument: { isCurrent: true },
      },
    ]);
    transactionState.tx.document.delete.mockResolvedValue({ id: 10 });
    await deleteDocumentWithCoverageRefresh({ documentId: 10, documentTypeId: 1 });

    expect(transactionState.tx.document.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { hasTaxInvoice: false },
    });
  });

  it("excludes invoices already linked to the maximum number of tax invoices", async () => {
    prismaState.documentFindUnique.mockResolvedValue({
      id: 10,
      documentTypeId: 1,
      isCurrent: true,
      supplierId: 1,
      recipientId: 2,
      lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
    });
    prismaState.documentFindMany.mockResolvedValue([
      {
        id: 20,
        documentNumber: "INV-1",
        documentDate: new Date("2026-04-02T00:00:00.000Z"),
        sourceFileName: "invoice.pdf",
        lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(3) }],
        invoiceCoverages: [
          {
            taxInvoiceDocument: {
              lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
            },
          },
          {
            taxInvoiceDocument: {
              lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(1) }],
            },
          },
        ],
      },
    ]);

    await expect(getTaxCoverageCandidates(10)).resolves.toEqual([]);
  });
});
