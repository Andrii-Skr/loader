import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus } from "@/generated/prisma/client";
import { InvoiceDetectionError } from "@/lib/pdf/parser";

const authMock = vi.hoisted(() => vi.fn());
const saveUploadedFileMock = vi.hoisted(() => vi.fn());
const extractPdfTextMock = vi.hoisted(() => vi.fn());
const detectAndParseInvoiceMock = vi.hoisted(() => vi.fn());
const ingestVatInvoiceMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const unlinkMock = vi.hoisted(() => vi.fn());

const prismaState = vi.hoisted(() => ({
  supplierFindUnique: vi.fn(),
  documentFindFirst: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdate: vi.fn(),
  documentDelete: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("node:fs/promises", () => ({
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
    detectAndParseInvoice: detectAndParseInvoiceMock,
  };
});

vi.mock("@/lib/pdf/persist", () => ({
  ingestVatInvoice: ingestVatInvoiceMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: prismaState.userFindUnique,
    },
    supplier: {
      findUnique: prismaState.supplierFindUnique,
    },
    document: {
      findFirst: prismaState.documentFindFirst,
      create: prismaState.documentCreate,
      update: prismaState.documentUpdate,
      delete: prismaState.documentDelete,
      findUnique: vi.fn(),
    },
  },
}));

import { uploadInvoice } from "@/app/actions/documents";

describe("uploadInvoice", () => {
  beforeEach(() => {
    authMock.mockReset();
    saveUploadedFileMock.mockReset();
    extractPdfTextMock.mockReset();
    detectAndParseInvoiceMock.mockReset();
    ingestVatInvoiceMock.mockReset();
    revalidatePathMock.mockReset();
    unlinkMock.mockReset();
    prismaState.supplierFindUnique.mockReset();
    prismaState.documentFindFirst.mockReset();
    prismaState.documentCreate.mockReset();
    prismaState.documentUpdate.mockReset();
    prismaState.documentDelete.mockReset();
    prismaState.userFindUnique.mockReset();

    authMock.mockResolvedValue({
      user: { id: 7 },
    });
    prismaState.userFindUnique.mockResolvedValue({ id: 7 });
    saveUploadedFileMock.mockResolvedValue("/tmp/doc.pdf");
    extractPdfTextMock.mockResolvedValue("pdf text");
    prismaState.supplierFindUnique.mockResolvedValue({ id: 101 });
    prismaState.documentFindFirst.mockResolvedValue(null);
    prismaState.documentCreate.mockResolvedValue({ id: 501 });
    prismaState.documentUpdate.mockResolvedValue({ id: 501 });
    ingestVatInvoiceMock.mockResolvedValue({ id: 501, extractionStatus: DocumentStatus.PROCESSED });
    unlinkMock.mockResolvedValue(undefined);
  });

  it("allows the same supplier/date/number across different contours", async () => {
    detectAndParseInvoiceMock.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
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
    expect(prismaState.documentFindFirst).toHaveBeenCalledWith({
      where: {
        documentContour: "RU",
        documentDate: new Date(Date.UTC(2026, 3, 11)),
        documentNumber: "45",
        supplierId: 101,
      },
      select: { id: true },
    });
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

  it("stores unknown contour documents for review", async () => {
    detectAndParseInvoiceMock.mockImplementation(() => {
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
});
