import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus } from "@/generated/prisma/client";
import { InvoiceDetectionError } from "@/lib/pdf/parser";

const authMock = vi.hoisted(() => vi.fn());
const saveUploadedFileMock = vi.hoisted(() => vi.fn());
const extractPdfTextMock = vi.hoisted(() => vi.fn());
const detectAndParseDocumentMock = vi.hoisted(() => vi.fn());
const ingestInvoiceDocumentMock = vi.hoisted(() => vi.fn());
const ingestVatInvoiceMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const unlinkMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const retireDocumentForNewVersionMock = vi.hoisted(() => vi.fn());
const autoMatchTaxInvoiceMock = vi.hoisted(() => vi.fn());
const deleteDocumentWithCoverageRefreshMock = vi.hoisted(() => vi.fn());
const rematchUncoveredTaxInvoicesForInvoiceMock = vi.hoisted(() => vi.fn());
const copyDocumentIssueMappingsMock = vi.hoisted(() => vi.fn());
const selectInvoiceDocumentVersionMock = vi.hoisted(() => vi.fn());

const prismaState = vi.hoisted(() => ({
  supplierFindUnique: vi.fn(),
  supplierFindFirst: vi.fn(),
  supplierFindMany: vi.fn(),
  documentFindFirst: vi.fn(),
  documentFindMany: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdate: vi.fn(),
  documentDelete: vi.fn(),
  documentFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  unlink: unlinkMock,
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/files/save-upload", () => ({
  saveUploadedFile: saveUploadedFileMock,
}));

vi.mock("@/lib/pdf/extract-pdf-text", () => ({
  PdfExtractionError: class PdfExtractionError extends Error {
    constructor(
      public readonly code: string,
      public readonly detail?: string,
    ) {
      super(detail ?? code);
    }
  },
  extractPdfText: extractPdfTextMock,
}));

vi.mock("@/lib/pdf/parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/parser")>("@/lib/pdf/parser");

  return {
    ...actual,
    detectAndParseDocument: detectAndParseDocumentMock,
  };
});

vi.mock("@/lib/pdf/persist", () => ({
  ingestInvoiceDocument: ingestInvoiceDocumentMock,
  ingestVatInvoice: ingestVatInvoiceMock,
}));

vi.mock("@/lib/documents/revisions", () => ({
  copyDocumentIssueMappings: copyDocumentIssueMappingsMock,
  selectInvoiceDocumentVersion: selectInvoiceDocumentVersionMock,
}));

vi.mock("@/lib/documents/tax-coverage", () => ({
  autoMatchTaxInvoice: autoMatchTaxInvoiceMock,
  deleteDocumentWithCoverageRefresh: deleteDocumentWithCoverageRefreshMock,
  rematchUncoveredTaxInvoicesForInvoice: rematchUncoveredTaxInvoicesForInvoiceMock,
  retireDocumentForNewVersion: retireDocumentForNewVersionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: prismaState.userFindUnique,
    },
    supplier: {
      findUnique: prismaState.supplierFindUnique,
      findFirst: prismaState.supplierFindFirst,
      findMany: prismaState.supplierFindMany,
    },
    document: {
      findFirst: prismaState.documentFindFirst,
      findMany: prismaState.documentFindMany,
      create: prismaState.documentCreate,
      update: prismaState.documentUpdate,
      delete: prismaState.documentDelete,
      findUnique: prismaState.documentFindUnique,
    },
  },
}));

import { deleteDocument, selectInvoiceVersion, uploadInvoice } from "@/app/actions/documents";

describe("uploadInvoice", () => {
  beforeEach(() => {
    authMock.mockReset();
    saveUploadedFileMock.mockReset();
    extractPdfTextMock.mockReset();
    detectAndParseDocumentMock.mockReset();
    ingestInvoiceDocumentMock.mockReset();
    ingestVatInvoiceMock.mockReset();
    revalidatePathMock.mockReset();
    unlinkMock.mockReset();
    readFileMock.mockReset();
    retireDocumentForNewVersionMock.mockReset();
    autoMatchTaxInvoiceMock.mockReset();
    deleteDocumentWithCoverageRefreshMock.mockReset();
    rematchUncoveredTaxInvoicesForInvoiceMock.mockReset();
    copyDocumentIssueMappingsMock.mockReset();
    selectInvoiceDocumentVersionMock.mockReset();
    prismaState.supplierFindUnique.mockReset();
    prismaState.supplierFindFirst.mockReset();
    prismaState.supplierFindMany.mockReset();
    prismaState.documentFindFirst.mockReset();
    prismaState.documentFindMany.mockReset();
    prismaState.documentCreate.mockReset();
    prismaState.documentUpdate.mockReset();
    prismaState.documentDelete.mockReset();
    prismaState.documentFindUnique.mockReset();
    prismaState.userFindUnique.mockReset();

    authMock.mockResolvedValue({
      user: { id: 7 },
    });
    prismaState.userFindUnique.mockResolvedValue({ id: 7 });
    saveUploadedFileMock.mockResolvedValue("/tmp/doc.pdf");
    readFileMock.mockResolvedValue(Buffer.from("pdf"));
    extractPdfTextMock.mockResolvedValue("pdf text");
    prismaState.supplierFindUnique.mockResolvedValue({ id: 101 });
    prismaState.supplierFindFirst.mockResolvedValue(null);
    prismaState.supplierFindMany.mockResolvedValue([]);
    prismaState.documentFindFirst.mockResolvedValue(null);
    prismaState.documentFindMany.mockResolvedValue([]);
    prismaState.documentCreate.mockResolvedValue({ id: 501 });
    prismaState.documentUpdate.mockResolvedValue({ id: 501 });
    ingestVatInvoiceMock.mockResolvedValue({ id: 501, extractionStatus: DocumentStatus.PROCESSED });
    ingestInvoiceDocumentMock.mockResolvedValue({
      id: 501,
      extractionStatus: DocumentStatus.PROCESSED,
    });
    unlinkMock.mockResolvedValue(undefined);
    retireDocumentForNewVersionMock.mockResolvedValue([]);
    autoMatchTaxInvoiceMock.mockResolvedValue(undefined);
    deleteDocumentWithCoverageRefreshMock.mockResolvedValue(undefined);
    rematchUncoveredTaxInvoicesForInvoiceMock.mockResolvedValue(undefined);
    copyDocumentIssueMappingsMock.mockResolvedValue(0);
    selectInvoiceDocumentVersionMock.mockResolvedValue({ taxInvoiceDocumentIds: [] });
  });

  it("allows the same supplier/date/number across different contours", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
      documentTypeId: 1,
      parsed: {
        documentType: "Счет-фактура",
        documentNumber: "45",
        documentDate: "11.04.2026",
        supplier: { name: 'ООО "Полипринт"', taxId: "7701234567", kpp: "770101001" },
        recipient: { name: 'ООО "Кузя"', taxId: "7712345678", kpp: "771201001" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "ru.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(result.errorKey).toBeNull();
    expect(result.successCount).toBe(1);
    expect(prismaState.documentFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentContour: "RU",
          documentNumber: "45",
          supplierId: 101,
          documentTypeId: 1,
        }),
      }),
    );
    expect(prismaState.supplierFindUnique).toHaveBeenCalledWith({
      where: { taxId: "7701234567/770101001" },
      select: { id: true },
    });
    expect(ingestVatInvoiceMock).toHaveBeenCalledWith({
      documentId: 501,
      contour: "RU",
      rawText: "pdf text",
    });
  });

  it("reports when a newly uploaded invoice replaces its current version", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
      documentTypeId: 1,
      parsed: {
        documentType: "Счет-фактура",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: 'ООО "Полипринт"', taxId: "7701234567", kpp: "770101001" },
        recipient: { name: 'ООО "Кузя"', taxId: "7712345678", kpp: "771201001" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 500,
      revision: 1,
      sourceFileName: "previous.pdf",
      isCurrent: true,
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "replacement.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(result.replacementCount).toBe(1);
    expect(result.results[0]).toMatchObject({
      replacedDocumentId: 500,
      replacedDocumentName: "previous.pdf",
      replacedRevision: 1,
      revision: 2,
    });
    expect(retireDocumentForNewVersionMock).toHaveBeenCalledWith({
      documentId: 500,
      documentTypeId: 1,
      newDocumentId: 501,
    });
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isCurrent: false }),
    });
    expect(ingestVatInvoiceMock.mock.invocationCallOrder[0]).toBeLessThan(
      retireDocumentForNewVersionMock.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("keeps the current tax invoice active when its replacement fails to ingest", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "vat-invoice-ua-v1",
      documentTypeId: 1,
      parsed: {
        documentType: "Податкова накладна",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: "Постачальник", taxId: "12345678", kpp: null },
        recipient: { name: "Покупець", taxId: "87654321", kpp: null },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 500,
      revision: 1,
      sourceFileName: "current.pdf",
      isCurrent: true,
    });
    ingestVatInvoiceMock.mockRejectedValue(new Error("ingestion failed"));

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "replacement.pdf", { type: "application/pdf" }));
    const result = await uploadInvoice(formData);

    expect(result.failedCount).toBe(1);
    expect(retireDocumentForNewVersionMock).not.toHaveBeenCalled();
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isCurrent: false }),
    });
  });

  it("does not leave a failed first upload as the current document", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: "Постачальник", taxId: "12345678", kpp: null },
        recipient: { name: "Покупець", taxId: "87654321", kpp: null },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    ingestInvoiceDocumentMock.mockRejectedValue(new Error("ingestion failed"));

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "new-invoice.pdf", { type: "application/pdf" }));
    const result = await uploadInvoice(formData);

    expect(result.failedCount).toBe(1);
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isCurrent: true }),
    });
    expect(prismaState.documentUpdate).toHaveBeenCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({
        extractionStatus: DocumentStatus.FAILED,
        isCurrent: false,
      }),
    });
  });

  it("uses the stored supplier identity to version invoices without a parsed tax ID", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: "Постачальник", taxId: null, kpp: null },
        recipient: { name: "Покупець", taxId: null, kpp: null },
        totalAmount: "2.00",
        vatAmount: "0.00",
        baseAmount: "2.00",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.supplierFindMany.mockResolvedValue([{ taxId: "name:stored-supplier" }]);
    prismaState.documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 500,
      revision: 1,
      sourceFileName: "current.pdf",
      isCurrent: true,
      documentNumber: "101",
      documentDate: new Date("2026-04-02T00:00:00.000Z"),
      totalAmount: { toString: () => "1.00" },
      currency: "UAH",
      documentContour: "UA",
      supplier: { name: "Постачальник" },
      recipient: { name: "Покупець" },
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "replacement.pdf", { type: "application/pdf" }));
    const result = await uploadInvoice(formData);

    expect(result.successCount).toBe(1);
    expect(result.results[0].versionSelection?.previous.id).toBe(500);
    expect(prismaState.supplierFindMany).toHaveBeenCalledWith({
      where: { name: { equals: "Постачальник", mode: "insensitive" } },
      select: { taxId: true },
      take: 2,
    });
    expect(prismaState.supplierFindUnique).toHaveBeenCalledWith({
      where: { taxId: "name:stored-supplier" },
      select: { id: true },
    });
  });

  it("rechecks uncovered tax invoices when a new invoice arrives", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: "Постачальник", taxId: "12345678", kpp: null },
        recipient: { name: "Покупець", taxId: "87654321", kpp: null },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "new-invoice.pdf", { type: "application/pdf" }));
    const result = await uploadInvoice(formData);

    expect(result.successCount).toBe(1);
    expect(rematchUncoveredTaxInvoicesForInvoiceMock).toHaveBeenCalledWith(501);
    expect(ingestInvoiceDocumentMock.mock.invocationCallOrder[0]).toBeLessThan(
      rematchUncoveredTaxInvoicesForInvoiceMock.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("does not let an old file replace its newer active version", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
      documentTypeId: 1,
      parsed: {
        documentType: "Счет-фактура",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: 'ООО "Полипринт"', taxId: "7701234567", kpp: "770101001" },
        recipient: { name: 'ООО "Кузя"', taxId: "7712345678", kpp: "771201001" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst
      .mockResolvedValueOnce({ id: 499, isCurrent: false })
      .mockResolvedValueOnce({
        id: 500,
        revision: 2,
        sourceFileName: "current.pdf",
        isCurrent: true,
      });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "old-copy.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(result.duplicateCount).toBe(1);
    expect(prismaState.documentCreate).not.toHaveBeenCalled();
    expect(retireDocumentForNewVersionMock).not.toHaveBeenCalled();
  });

  it("requires an operator to choose the current replacement invoice", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок на оплату",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: 'ТОВ "Поліпринт"', taxId: "12345678" },
        recipient: { name: 'ТОВ "Кузя"', taxId: "87654321" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 500,
      revision: 1,
      sourceFileName: "previous.pdf",
      isCurrent: true,
      documentNumber: "101",
      documentDate: new Date("2026-04-02T00:00:00.000Z"),
      totalAmount: { toString: () => "1.00" },
      currency: "UAH",
      documentContour: "UA",
      supplier: { name: 'ТОВ "Поліпрінт"' },
      recipient: { name: 'ТОВ "Кузя"' },
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "replacement.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(ingestInvoiceDocumentMock).toHaveBeenCalledWith({
      documentId: 501,
      rawText: "pdf text",
      parsed: expect.objectContaining({ documentNumber: "101" }),
      parserVersion: "invoice-ua-v1",
    });
    expect(copyDocumentIssueMappingsMock).toHaveBeenCalledWith({
      sourceDocumentId: 500,
      targetDocumentId: 501,
    });
    expect(retireDocumentForNewVersionMock).not.toHaveBeenCalled();
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isCurrent: false }),
    });
    expect(result.results[0].versionSelection).toMatchObject({
      previous: { id: 500, sourceFileName: "previous.pdf" },
      uploaded: { id: 501, sourceFileName: "replacement.pdf" },
    });
  });

  it("rejects an invoice whose parsed business content already exists", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок на оплату",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: 'ТОВ "Поліпрінт"', taxId: "12345678" },
        recipient: { name: 'ТОВ "Кузя"', taxId: "87654321" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [
          {
            lineNo: 1,
            description: "Послуга",
            sourceRowCode: null,
            serviceCode: null,
            itemTypeCode: null,
            unitName: null,
            unitCode: null,
            quantity: "1",
            unitPrice: "1.00",
            vatRate: "20%",
            benefitCode: null,
            lineBaseAmount: "0.80",
            lineVatAmount: "0.20",
            exciseAmount: null,
            lineTotalAmount: "1.00",
            countryCode: null,
            countryName: null,
            customsDeclarationNumber: null,
            rawRowText: "Послуга",
          },
        ],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 500,
      revision: 1,
      sourceFileName: "current.pdf",
      isCurrent: true,
    });
    prismaState.documentFindMany.mockResolvedValue([
      {
        totalAmount: { toString: () => "1.00" },
        recipient: { name: 'ТОВ "Кузя"', taxId: "87654321" },
        lineItems: [
          {
            description: "Послуга",
            quantity: { toString: () => "1" },
            unitPrice: { toString: () => "1.00" },
            vatRate: "20%",
            lineBaseAmount: { toString: () => "0.80" },
            lineVatAmount: { toString: () => "0.20" },
            lineTotalAmount: { toString: () => "1.00" },
          },
        ],
      },
    ]);

    const formData = new FormData();
    formData.append("pdf", new File(["another PDF"], "duplicate-by-content.pdf"));

    const result = await uploadInvoice(formData);

    expect(result.duplicateCount).toBe(1);
    expect(prismaState.documentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          extractionStatus: { not: DocumentStatus.FAILED },
        }),
      }),
    );
    expect(prismaState.documentCreate).not.toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalledWith("/tmp/doc.pdf");
  });

  it("restores equivalent invoice content when no version is current", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "UA",
      parserVersion: "invoice-ua-v1",
      documentTypeId: 2,
      parsed: {
        documentType: "Рахунок",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: "Постачальник", taxId: "12345678", kpp: null },
        recipient: { name: "Покупець", taxId: "87654321", kpp: null },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst
      .mockResolvedValueOnce({ id: 500, isCurrent: false })
      .mockResolvedValueOnce({
        id: 500,
        revision: 1,
        sourceFileName: "historical.pdf",
        isCurrent: false,
      })
      .mockResolvedValueOnce(null);

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "restored.pdf", { type: "application/pdf" }));
    const result = await uploadInvoice(formData);

    expect(result.successCount).toBe(1);
    expect(prismaState.documentFindMany).not.toHaveBeenCalled();
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isCurrent: true, revision: 2, supersedesId: 500 }),
    });
  });

  it("makes a selected invoice version current and rematches affected tax invoices", async () => {
    selectInvoiceDocumentVersionMock.mockResolvedValue({ taxInvoiceDocumentIds: [41, 42] });

    await expect(selectInvoiceVersion({ documentId: 501, locale: "ru" })).resolves.toEqual({
      errorKey: null,
    });

    expect(selectInvoiceDocumentVersionMock).toHaveBeenCalledWith({ documentId: 501 });
    expect(autoMatchTaxInvoiceMock.mock.calls.map(([documentId]) => documentId)).toEqual([41, 42]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/ru/dashboard");
  });

  it("reports a committed version selection as successful when one rematch fails", async () => {
    selectInvoiceDocumentVersionMock.mockResolvedValue({ taxInvoiceDocumentIds: [41, 42] });
    autoMatchTaxInvoiceMock.mockRejectedValueOnce(new Error("database unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(selectInvoiceVersion({ documentId: 501, locale: "ru" })).resolves.toEqual({
        errorKey: null,
      });
      expect(autoMatchTaxInvoiceMock.mock.calls.map(([documentId]) => documentId)).toEqual([
        41, 42,
      ]);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("restores the version chain when the current invoice was deleted", async () => {
    detectAndParseDocumentMock.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
      documentTypeId: 1,
      parsed: {
        documentType: "Счет-фактура",
        documentNumber: "101",
        documentDate: "02.04.2026",
        supplier: { name: 'ООО "Полипринт"', taxId: "7701234567", kpp: "770101001" },
        recipient: { name: 'ООО "Кузя"', taxId: "7712345678", kpp: "771201001" },
        totalAmount: "1.00",
        vatAmount: "0.20",
        baseAmount: "0.80",
        lineItems: [],
        rawText: "pdf text",
        reviewRequired: false,
      },
    });
    prismaState.documentFindFirst
      .mockResolvedValueOnce({ id: 500, isCurrent: false })
      .mockResolvedValueOnce({
        id: 500,
        revision: 1,
        sourceFileName: "superseded.pdf",
        isCurrent: false,
      });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "restored.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(result.successCount).toBe(1);
    expect(result.replacementCount).toBe(1);
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ revision: 2, supersedesId: 500 }),
    });
    expect(retireDocumentForNewVersionMock).not.toHaveBeenCalled();
  });

  it("stores unknown contour documents for review", async () => {
    detectAndParseDocumentMock.mockImplementation(() => {
      throw new InvoiceDetectionError(
        "documentContourUnknown",
        "The document does not match any supported invoice contour.",
      );
    });

    const formData = new FormData();
    formData.append("pdf", new File(["pdf"], "unknown.pdf", { type: "application/pdf" }));

    const result = await uploadInvoice(formData);

    expect(result.results[0]).toMatchObject({
      fileName: "unknown.pdf",
      errorKey: "documentContourUnknown",
    });
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extractionStatus: DocumentStatus.NEEDS_REVIEW,
        parserVersion: "invoice-detector-v1",
        rawText: "pdf text",
        reviewRequired: true,
        sourceFileName: "unknown.pdf",
      }),
    });
  });

  it("keeps an unsupported XLS upload for troubleshooting and a later retry", async () => {
    const formData = new FormData();
    formData.append("document", new File(["not an XLS workbook"], "failure.xls"));

    const result = await uploadInvoice(formData);

    expect(result.results[0]).toMatchObject({
      fileName: "failure.xls",
      errorKey: "parseFailed",
    });
    expect(prismaState.documentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentTypeId: 2,
        extractionStatus: DocumentStatus.FAILED,
        reviewRequired: true,
        sourceFileName: "failure.xls",
      }),
    });
  });

  it("allows operators to delete documents", async () => {
    authMock.mockResolvedValue({ user: { id: 7, role: "OPERATOR" } });
    prismaState.documentFindUnique.mockResolvedValue({
      id: 501,
      documentTypeId: 2,
      sourceFilePath: null,
    });

    await expect(deleteDocument({ documentId: 501, locale: "ru" })).resolves.toEqual({
      errorKey: null,
      success: true,
    });

    expect(deleteDocumentWithCoverageRefreshMock).toHaveBeenCalledWith({
      documentId: 501,
      documentTypeId: 2,
    });
  });

  it("allows administrators to delete documents", async () => {
    authMock.mockResolvedValue({ user: { id: 1, role: "ADMIN" } });
    prismaState.documentFindUnique.mockResolvedValue({
      id: 501,
      documentTypeId: 1,
      sourceFilePath: null,
    });

    await expect(deleteDocument({ documentId: 501, locale: "ru" })).resolves.toEqual({
      errorKey: null,
      success: true,
    });

    expect(deleteDocumentWithCoverageRefreshMock).toHaveBeenCalledWith({
      documentId: 501,
      documentTypeId: 1,
    });
  });
});
