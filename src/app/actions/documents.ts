"use server";

import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { auth } from "@/auth";
import { DocumentStatus } from "@/generated/prisma/client";
import { type AppLocale, routing } from "@/i18n/routing";
import { saveUploadedFile } from "@/lib/files/save-upload";
import { PdfExtractionError, extractPdfText } from "@/lib/pdf/extract-pdf-text";
import { parseVatInvoiceUaV1 } from "@/lib/pdf/parser";
import { ingestVatInvoice } from "@/lib/pdf/persist";
import { prisma } from "@/lib/prisma";

const uploadInvoiceSchema = z.object({
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
  errorKey: "missingSession" | "invalidInput" | "notFound" | "deleteFailed" | null;
  success: boolean;
};

const deleteDocumentSchema = z.object({
  documentId: z.number().int().positive(),
  locale: z.string(),
});

export const uploadInvoice = async (formData: FormData): Promise<UploadInvoiceActionResult> => {
  const session = await auth();

  if (!session?.user?.id) {
    return emptyUploadResult("missingSession");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!existingUser) {
    return emptyUploadResult("staleSession");
  }

  const pdfs = formData
    .getAll("pdf")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (pdfs.length === 0) {
    return emptyUploadResult("missingPdf");
  }

  const parsed = uploadInvoiceSchema.safeParse({
    extractedText: String(formData.get("extractedText") ?? ""),
  });

  if (!parsed.success) {
    return emptyUploadResult("invalidInput");
  }

  const results: UploadInvoiceActionResult["results"] = [];

  for (const pdf of pdfs) {
    results.push(
      await uploadSingleInvoice({
        pdf,
        extractedText: parsed.data.extractedText?.trim() || null,
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
};

export const deleteDocument = async ({
  documentId,
  locale,
}: {
  documentId: number;
  locale: string;
}): Promise<DeleteDocumentActionResult> => {
  const session = await auth();

  if (!session?.user?.id) {
    return { errorKey: "missingSession", success: false };
  }

  const parsed = deleteDocumentSchema.safeParse({ documentId, locale });

  if (!parsed.success || !routing.locales.includes(parsed.data.locale as AppLocale)) {
    return { errorKey: "invalidInput", success: false };
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: parsed.data.documentId },
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

    revalidatePath(`/${parsed.data.locale}/dashboard`);
    revalidatePath(`/${parsed.data.locale}/dashboard/documents/${document.id}`);

    return { errorKey: null, success: true };
  } catch {
    return { errorKey: "deleteFailed", success: false };
  }
};

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

  try {
    const resolvedText = extractedText || (await extractPdfText(sourceFilePath));
    const parsedInvoice = parseVatInvoiceUaV1(resolvedText);
    const documentDate = parseDocumentDate(parsedInvoice.documentDate);
    const existingSupplier = await prisma.supplier.findUnique({
      where: { taxId: parsedInvoice.supplier.taxId },
      select: { id: true },
    });

    if (existingSupplier) {
      const duplicateDocument = await prisma.document.findUnique({
        where: {
          documentNumber_documentDate_supplierId: {
            documentNumber: parsedInvoice.documentNumber,
            documentDate,
            supplierId: existingSupplier.id,
          },
        },
        select: { id: true },
      });

      if (duplicateDocument) {
        await deleteUploadedFile(sourceFilePath);

        return {
          fileName: pdf.name,
          errorKey: "duplicateDocument" as const,
          detail: null,
        };
      }
    }

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

const deleteUploadedFile = async (filePath: string) => {
  await unlink(filePath).catch(() => undefined);
};
