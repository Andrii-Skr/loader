"use server";

import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { DocumentStatus } from "@/generated/prisma/client";
import { type AppLocale, routing } from "@/i18n/routing";
import { getStoredPartyTaxId } from "@/lib/documents/party-tax-id";
import { saveUploadedFile } from "@/lib/files/save-upload";
import { PdfExtractionError, extractPdfText } from "@/lib/pdf/extract-pdf-text";
import {
  type DocumentContour,
  InvoiceDetectionError,
  detectAndParseInvoice,
} from "@/lib/pdf/parser";
import { ingestVatInvoice } from "@/lib/pdf/persist";
import { prisma } from "@/lib/prisma";
import { abortAction, appAction, appFormDataAction } from "@/utils/appAction";

const uploadInvoiceSchema = z.object({
  pdfs: z.array(z.instanceof(File)),
  extractedText: z.string().optional(),
});

export type UploadInvoiceActionResult = {
  errorKey: "missingSession" | "missingPdf" | "invalidInput" | "staleSession" | null;
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  results: Array<{
    fileName: string;
    errorKey:
      | "duplicateDocument"
      | "documentContourAmbiguous"
      | "documentContourUnknown"
      | "parseFailed"
      | "pdfReadFailed"
      | "pdfHasNoTextLayer"
      | "pdfOcrFailed"
      | "pdfOcrUnavailable"
      | null;
    detail?: string | null;
  }>;
};

export type DeleteDocumentActionResult = {
  errorKey: "missingSession" | "forbidden" | "invalidInput" | "notFound" | "deleteFailed" | null;
  success: boolean;
};

const deleteDocumentSchema = z.object({
  documentId: z.number().int().positive(),
  locale: z.string(),
});

export const uploadInvoice = appFormDataAction<
  {
    pdfs: File[];
    extractedText: string;
  },
  z.infer<typeof uploadInvoiceSchema>,
  UploadInvoiceActionResult
>(
  async (parsedInput, { user }) => {
    if (!user?.id) {
      return emptyUploadResult("missingSession");
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true },
    });

    if (!existingUser) {
      return emptyUploadResult("staleSession");
    }

    const results: UploadInvoiceActionResult["results"] = [];

    for (const pdf of parsedInput.pdfs) {
      results.push(
        await uploadSingleInvoice({
          pdf,
          extractedText: parsedInput.extractedText?.trim() || null,
          uploadedById: existingUser.id,
        }),
      );
    }

    revalidatePath("/ru/dashboard");
    revalidatePath("/uk/dashboard");
    revalidatePath("/en/dashboard");

    return {
      errorKey: null,
      successCount: results.filter((item) => item.errorKey === null).length,
      failedCount: results.filter((item) => item.errorKey && item.errorKey !== "duplicateDocument")
        .length,
      duplicateCount: results.filter((item) => item.errorKey === "duplicateDocument").length,
      results,
    };
  },
  {
    requireAuth: true,
    prepareInput: (formData) => {
      const pdfs = formData
        .getAll("pdf")
        .filter((value): value is File => value instanceof File && value.size > 0);

      if (pdfs.length === 0) {
        return abortAction(emptyUploadResult("missingPdf"));
      }

      return {
        ok: true,
        value: {
          pdfs,
          extractedText: String(formData.get("extractedText") ?? ""),
        },
      };
    },
    schema: uploadInvoiceSchema,
    onUnauthorized: () => emptyUploadResult("missingSession"),
    onInvalidInput: () => emptyUploadResult("invalidInput"),
  },
);

export const deleteDocument = async ({
  documentId,
  locale,
}: {
  documentId: number;
  locale: string;
}): Promise<DeleteDocumentActionResult> =>
  appAction<
    z.input<typeof deleteDocumentSchema>,
    z.infer<typeof deleteDocumentSchema>,
    DeleteDocumentActionResult
  >(
    async (parsedInput) => {
      if (!routing.locales.includes(parsedInput.locale as AppLocale)) {
        return { errorKey: "invalidInput", success: false };
      }

      try {
        const document = await prisma.document.findUnique({
          where: { id: parsedInput.documentId },
          select: {
            id: true,
            sourceFilePath: true,
          },
        });

        if (!document) {
          return { errorKey: "notFound", success: false };
        }

        await prisma.document.delete({
          where: { id: document.id },
        });

        if (document.sourceFilePath) {
          await deleteUploadedFile(document.sourceFilePath);
        }

        revalidatePath(`/${parsedInput.locale}/dashboard`);
        revalidatePath(`/${parsedInput.locale}/dashboard/documents/${document.id}`);

        return { errorKey: null, success: true };
      } catch {
        return { errorKey: "deleteFailed", success: false };
      }
    },
    {
      requireAuth: true,
      roles: ["ADMIN"],
      onForbidden: () => ({ errorKey: "forbidden", success: false }),
      schema: deleteDocumentSchema,
      onUnauthorized: () => ({ errorKey: "missingSession", success: false }),
      onInvalidInput: () => ({ errorKey: "invalidInput", success: false }),
    },
  )({ documentId, locale });

const parseDocumentDate = (value: string): Date => {
  const [day, month, year] = value.split(".");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const emptyUploadResult = (
  errorKey: UploadInvoiceActionResult["errorKey"],
): UploadInvoiceActionResult => ({
  errorKey,
  successCount: 0,
  failedCount: 0,
  duplicateCount: 0,
  results: [],
});

const uploadSingleInvoice = async ({
  pdf,
  extractedText,
  uploadedById,
}: {
  pdf: File;
  extractedText: string | null;
  uploadedById: number;
}) => {
  const sourceFilePath = await saveUploadedFile(pdf);
  let createdId: number | null = null;
  let resolvedText: string | null = extractedText;

  try {
    resolvedText = extractedText || (await extractPdfText(sourceFilePath));
    const detectedInvoice = detectAndParseInvoice(resolvedText);
    const documentDate = parseDocumentDate(detectedInvoice.parsed.documentDate);

    await assertNotDuplicateDocument({
      contour: detectedInvoice.contour,
      documentDate,
      documentNumber: detectedInvoice.parsed.documentNumber,
      supplierTaxId: getStoredPartyTaxId({
        contour: detectedInvoice.contour,
        taxId: detectedInvoice.parsed.supplier.taxId,
        kpp: detectedInvoice.parsed.supplier.kpp,
      }),
    });

    const created = await prisma.document.create({
      data: {
        sourceFileName: pdf.name,
        sourceFilePath,
        uploadedById,
        extractionStatus: DocumentStatus.PENDING,
      },
    });
    createdId = created.id;

    await ingestVatInvoice({
      documentId: createdId,
      contour: detectedInvoice.contour,
      rawText: resolvedText,
    });

    return {
      fileName: pdf.name,
      errorKey: null,
      detail: null,
    };
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      await deleteUploadedFile(sourceFilePath);

      return {
        fileName: pdf.name,
        errorKey: error.code,
        detail: error.detail ?? null,
      };
    }

    if (error instanceof DuplicateDocumentError) {
      await deleteUploadedFile(sourceFilePath);

      return {
        fileName: pdf.name,
        errorKey: "duplicateDocument" as const,
        detail: null,
      };
    }

    if (error instanceof InvoiceDetectionError) {
      if (createdId === null) {
        const created = await prisma.document.create({
          data: {
            sourceFileName: pdf.name,
            sourceFilePath,
            uploadedById,
            parserVersion: "invoice-detector-v1",
            extractionStatus: DocumentStatus.NEEDS_REVIEW,
            reviewRequired: true,
            rawText: resolvedText,
            extractedAt: new Date(),
          },
        });
        createdId = created.id;
      } else {
        await prisma.document.update({
          where: { id: createdId },
          data: {
            parserVersion: "invoice-detector-v1",
            extractionStatus: DocumentStatus.NEEDS_REVIEW,
            reviewRequired: true,
            rawText: resolvedText,
            extractedAt: new Date(),
          },
        });
      }

      return {
        fileName: pdf.name,
        errorKey: error.code,
        detail: error.message,
      };
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (createdId !== null) {
        await prisma.document.delete({
          where: { id: createdId },
        });
      }
      await deleteUploadedFile(sourceFilePath);

      return {
        fileName: pdf.name,
        errorKey: "duplicateDocument" as const,
        detail: null,
      };
    }

    if (createdId !== null) {
      await prisma.document.update({
        where: { id: createdId },
        data: {
          extractionStatus: DocumentStatus.FAILED,
          reviewRequired: true,
        },
      });
    } else {
      await deleteUploadedFile(sourceFilePath);
    }

    return {
      fileName: pdf.name,
      errorKey: "parseFailed" as const,
      detail: error instanceof Error ? error.message : null,
    };
  }
};

class DuplicateDocumentError extends Error {}

const assertNotDuplicateDocument = async ({
  contour,
  documentDate,
  documentNumber,
  supplierTaxId,
}: {
  contour: DocumentContour;
  documentDate: Date;
  documentNumber: string;
  supplierTaxId: string;
}) => {
  const existingSupplier = await prisma.supplier.findUnique({
    where: { taxId: supplierTaxId },
    select: { id: true },
  });

  if (!existingSupplier) {
    return;
  }

  const duplicateDocument = await prisma.document.findFirst({
    where: {
      documentContour: contour,
      documentNumber,
      documentDate,
      supplierId: existingSupplier.id,
    },
    select: { id: true },
  });

  if (duplicateDocument) {
    throw new DuplicateDocumentError("Duplicate document");
  }
};

const deleteUploadedFile = async (filePath: string) => {
  await unlink(filePath).catch(() => undefined);
};
