import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma, TaxCoverageStatus } from "@/generated/prisma/client";

const prismaState = vi.hoisted(() => ({
  documentFindUnique: vi.fn(),
  documentFindMany: vi.fn(),
  documentUpdate: vi.fn(),
}));

const transactionState = vi.hoisted(() => ({
  run: vi.fn(),
  tx: {
    documentTaxCoverage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
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
    $transaction: transactionState.run,
    document: {
      findUnique: prismaState.documentFindUnique,
      findMany: prismaState.documentFindMany,
      update: prismaState.documentUpdate,
    },
  },
}));

import {
  assignTaxInvoiceCoverage,
  deleteDocumentWithCoverageRefresh,
  getTaxCoverageCandidates,
  rematchUncoveredTaxInvoicesForInvoice,
} from "@/lib/documents/tax-coverage";

describe("getTaxCoverageCandidates", () => {
  beforeEach(() => {
    transactionState.run.mockReset();
    transactionState.run.mockImplementation(async (callback) => callback(transactionState.tx));
    transactionState.tx.documentTaxCoverage.findUnique.mockReset();
    transactionState.tx.documentTaxCoverage.count.mockReset();
    transactionState.tx.documentTaxCoverage.create.mockReset();
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

  it("accepts an exact decimal remainder and rejects actual overcoverage", async () => {
    prismaState.documentFindUnique.mockResolvedValue({
      id: 10,
      documentTypeId: 1,
      isCurrent: true,
      supplierId: 1,
      recipientId: 2,
      lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal("0.1") }],
    });
    prismaState.documentFindMany.mockResolvedValue([
      {
        id: 20,
        documentNumber: "INV-1",
        documentDate: new Date("2026-04-02"),
        sourceFileName: "invoice.pdf",
        lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal("100.3") }],
        invoiceCoverages: [
          {
            taxInvoiceDocument: {
              lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal("100.2") }],
            },
          },
        ],
      },
    ]);

    expect(await getTaxCoverageCandidates(10)).toMatchObject([{ invoiceDocumentId: 20 }]);

    prismaState.documentFindUnique.mockResolvedValue({
      id: 10,
      documentTypeId: 1,
      isCurrent: true,
      supplierId: 1,
      recipientId: 2,
      lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal("0.101") }],
    });
    expect(await getTaxCoverageCandidates(10)).toEqual([]);
  });

  it("marks an invoice fully covered when decimal quantities add up exactly", async () => {
    transactionState.tx.document.findUnique
      .mockResolvedValueOnce({ id: 10, sourceFilePath: null })
      .mockResolvedValueOnce({
        lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal("0.8") }],
        invoiceCoverages: ["0.1", "0.7"].map((quantity) => ({
          taxInvoiceDocument: {
            lineItems: [{ publicationIssueId: 5, quantity: new Prisma.Decimal(quantity) }],
          },
        })),
      });
    transactionState.tx.documentTaxCoverage.findMany.mockResolvedValue([
      { invoiceDocumentId: 20, taxInvoiceDocumentId: 10 },
    ]);

    await deleteDocumentWithCoverageRefresh({ documentId: 10, documentTypeId: 1 });

    expect(transactionState.tx.document.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { hasTaxInvoice: true },
    });
  });
});

describe("assignTaxInvoiceCoverage", () => {
  const input = { taxInvoiceDocumentId: 10, invoiceDocumentId: 20, isAutomatic: false };
  const conflict = new Prisma.PrismaClientKnownRequestError("Serialization conflict", {
    code: "P2034",
    clientVersion: "7",
  });
  const line = { publicationIssueId: 5, quantity: new Prisma.Decimal(1) };
  const taxInvoice = {
    id: 10,
    documentTypeId: 1,
    isCurrent: true,
    supplierId: 1,
    recipientId: 2,
    lineItems: [line],
  };
  const invoice = {
    id: 20,
    documentTypeId: 2,
    isCurrent: true,
    supplierId: 1,
    recipientId: 2,
    lineItems: [line],
    invoiceCoverages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transactionState.run.mockReset();
    transactionState.run.mockImplementation(async (callback) => callback(transactionState.tx));
    transactionState.tx.document.findUnique.mockReset();
    transactionState.tx.document.findUnique.mockImplementation(async ({ where }) =>
      where.id === 10 ? taxInvoice : invoice,
    );
    transactionState.tx.documentTaxCoverage.count.mockResolvedValue(0);
    transactionState.tx.documentTaxCoverage.findUnique.mockResolvedValue(null);
  });

  it("checks and writes coverage in a serializable transaction", async () => {
    await assignTaxInvoiceCoverage(input);

    expect(transactionState.run).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(transactionState.tx.documentTaxCoverage.create).toHaveBeenCalledWith({ data: input });
    expect(transactionState.tx.document.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { taxCoverageStatus: TaxCoverageStatus.MATCHED },
    });
  });

  it("rechecks the remaining quantity after a conflict instead of reusing stale validation", async () => {
    transactionState.run.mockImplementationOnce(async (callback) => {
      await callback(transactionState.tx);
      transactionState.tx.document.findUnique.mockImplementation(async ({ where }) =>
        where.id === 10
          ? taxInvoice
          : {
              ...invoice,
              invoiceCoverages: [{ taxInvoiceDocument: { lineItems: [line] } }],
            },
      );
      transactionState.tx.documentTaxCoverage.count.mockResolvedValue(1);
      throw conflict;
    });

    await expect(assignTaxInvoiceCoverage(input)).rejects.toThrow("can no longer be linked");
    expect(transactionState.run).toHaveBeenCalledTimes(2);
    // The aborted first attempt wrote once; the retry must reject before another write.
    expect(transactionState.tx.documentTaxCoverage.create).toHaveBeenCalledTimes(1);
  });

  it("retries serialization conflicts at most three times", async () => {
    transactionState.run.mockRejectedValue(conflict);

    await expect(assignTaxInvoiceCoverage(input)).rejects.toBe(conflict);
    expect(transactionState.run).toHaveBeenCalledTimes(3);
  });

  it("does not retry unrelated database failures", async () => {
    const error = new Error("Database unavailable");
    transactionState.run.mockRejectedValue(error);

    await expect(assignTaxInvoiceCoverage(input)).rejects.toBe(error);
    expect(transactionState.run).toHaveBeenCalledTimes(1);
  });
});
