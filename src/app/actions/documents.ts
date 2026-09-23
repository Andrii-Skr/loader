"use server";

import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import { DocumentStatus } from "@/generated/prisma/client";
import { type AppLocale, routing } from "@/i18n/routing";
import { normalizePartyName } from "@/lib/documents/party-name";
import { getStoredPartyTaxId, resolvePartyTaxId } from "@/lib/documents/party-tax-id";
import { copyDocumentIssueMappings, selectInvoiceDocumentVersion } from "@/lib/documents/revisions";
import {
  autoMatchTaxInvoice,
  deleteDocumentWithCoverageRefresh,
  rematchUncoveredTaxInvoicesForInvoice,
  retireDocumentForNewVersion,
} from "@/lib/documents/tax-coverage";
import { saveUploadedFile } from "@/lib/files/save-upload";
import { PdfExtractionError, extractPdfText } from "@/lib/pdf/extract-pdf-text";
import { parseLandpressXls } from "@/lib/pdf/invoice-document-parser";
import {
  type DocumentContour,
  InvoiceDetectionError,
  detectAndParseDocument,
} from "@/lib/pdf/parser";
import { ingestInvoiceDocument, ingestVatInvoice } from "@/lib/pdf/persist";
import type { ParsedVatInvoice } from "@/lib/pdf/types";
import { prisma } from "@/lib/prisma";
import { abortAction, appAction, appFormDataAction } from "@/utils/appAction";

const uploadDocumentsSchema = z.object({
  files: z.array(z.instanceof(File)),
  extractedText: z.string().optional(),
});

export type UploadInvoiceActionResult = {
  errorKey: "missingSession" | "missingPdf" | "invalidInput" | "staleSession" | null;
  successCount: number;
  failedCount: number;
  duplicateCount: number;
  replacementCount: number;
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
    replacedDocumentId?: number | null;
    replacedDocumentName?: string | null;
    replacedRevision?: number | null;
    revision?: number | null;
    versionSelection?: {
      previous: InvoiceVersionSummary;
      uploaded: InvoiceVersionSummary;
    } | null;
  }>;
};

export type InvoiceVersionSummary = {
  id: number;
  sourceFileName: string;
  documentNumber: string | null;
  documentDate: string | null;
  supplierName: string | null;
  recipientName: string | null;
  totalAmount: string | null;
  currency: string;
  revision: number;
};

export type DeleteDocumentActionResult = {
  errorKey: "missingSession" | "forbidden" | "invalidInput" | "notFound" | "deleteFailed" | null;
  success: boolean;
};

export type ConfirmTaxCoverageActionResult = {
  errorKey: "missingSession" | "invalidInput" | "assignmentFailed" | null;
};

export type SelectInvoiceVersionActionResult = {
  errorKey: "missingSession" | "invalidInput" | "selectionFailed" | null;
};

const deleteDocumentSchema = z.object({
  documentId: z.number().int().positive(),
  locale: z.string(),
});

const confirmTaxCoverageSchema = z.object({
  taxInvoiceDocumentId: z.number().int().positive(),
  invoiceDocumentId: z.number().int().positive(),
  locale: z.string(),
});

const selectInvoiceVersionSchema = z.object({
  documentId: z.number().int().positive(),
  locale: z.string(),
});

export const uploadDocuments = appFormDataAction<
  {
    files: File[];
    extractedText: string;
  },
  z.infer<typeof uploadDocumentsSchema>,
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

    for (const file of parsedInput.files) {
      results.push(
        await uploadSingleDocument({
          file,
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
      replacementCount: results.filter((item) => Number.isInteger(item.replacedDocumentId)).length,
      results,
    };
  },
  {
    requireAuth: true,
    prepareInput: (formData) => {
      const files = formData
        .getAll("document")
        .filter((value): value is File => value instanceof File && value.size > 0);
      const legacyPdfFiles = formData
        .getAll("pdf")
        .filter((value): value is File => value instanceof File && value.size > 0);
      const selectedFiles = files.length > 0 ? files : legacyPdfFiles;

      if (selectedFiles.length === 0) {
        return abortAction(emptyUploadResult("missingPdf"));
      }

      return {
        ok: true,
        value: {
          files: selectedFiles,
          extractedText: String(formData.get("extractedText") ?? ""),
        },
      };
    },
    schema: uploadDocumentsSchema,
    onUnauthorized: () => emptyUploadResult("missingSession"),
    onInvalidInput: () => emptyUploadResult("invalidInput"),
  },
);

export const uploadInvoice = uploadDocuments;

export const confirmTaxInvoiceCoverage = async ({
  taxInvoiceDocumentId,
  invoiceDocumentId,
  locale,
}: z.input<typeof confirmTaxCoverageSchema>): Promise<ConfirmTaxCoverageActionResult> =>
  appAction<
    z.input<typeof confirmTaxCoverageSchema>,
    z.infer<typeof confirmTaxCoverageSchema>,
    ConfirmTaxCoverageActionResult
  >(
    async (parsedInput) => {
      if (!routing.locales.includes(parsedInput.locale as AppLocale)) {
        return { errorKey: "invalidInput" };
      }

      try {
        const { assignTaxInvoiceCoverage } = await import("@/lib/documents/tax-coverage");
        await assignTaxInvoiceCoverage({
          taxInvoiceDocumentId: parsedInput.taxInvoiceDocumentId,
          invoiceDocumentId: parsedInput.invoiceDocumentId,
          isAutomatic: false,
        });
        revalidatePath(`/${parsedInput.locale}/dashboard`);
        revalidatePath(`/${parsedInput.locale}/dashboard/tax-coverage`);
        return { errorKey: null };
      } catch {
        return { errorKey: "assignmentFailed" };
      }
    },
    {
      requireAuth: true,
      schema: confirmTaxCoverageSchema,
      onUnauthorized: () => ({ errorKey: "missingSession" }),
      onInvalidInput: () => ({ errorKey: "invalidInput" }),
    },
  )({ taxInvoiceDocumentId, invoiceDocumentId, locale });

export const selectInvoiceVersion = async ({
  documentId,
  locale,
}: z.input<typeof selectInvoiceVersionSchema>): Promise<SelectInvoiceVersionActionResult> =>
  appAction<
    z.input<typeof selectInvoiceVersionSchema>,
    z.infer<typeof selectInvoiceVersionSchema>,
    SelectInvoiceVersionActionResult
  >(
    async (parsedInput) => {
      if (!routing.locales.includes(parsedInput.locale as AppLocale)) {
        return { errorKey: "invalidInput" };
      }

      try {
        const { taxInvoiceDocumentIds } = await selectInvoiceDocumentVersion({
          documentId: parsedInput.documentId,
        });
        for (const taxInvoiceDocumentId of taxInvoiceDocumentIds) {
          try {
            await autoMatchTaxInvoice(taxInvoiceDocumentId);
          } catch (error) {
            console.error("Could not rematch tax invoice after version selection", error);
          }
        }
        revalidatePath(`/${parsedInput.locale}/dashboard`);
        revalidatePath(`/${parsedInput.locale}/dashboard/documents/${parsedInput.documentId}`);
        return { errorKey: null };
      } catch {
        return { errorKey: "selectionFailed" };
      }
    },
    {
      requireAuth: true,
      schema: selectInvoiceVersionSchema,
      onUnauthorized: () => ({ errorKey: "missingSession" }),
      onInvalidInput: () => ({ errorKey: "invalidInput" }),
    },
  )({ documentId, locale });

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
            documentTypeId: true,
          },
        });

        if (!document) {
          return { errorKey: "notFound", success: false };
        }

        const sourceFilePaths = await deleteDocumentWithCoverageRefresh({
          documentId: document.id,
          documentTypeId: document.documentTypeId,
        });

        for (const sourceFilePath of sourceFilePaths) {
          await deleteUploadedFile(sourceFilePath);
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
  replacementCount: 0,
  results: [],
});

const uploadSingleDocument = async ({
  file,
  extractedText,
  uploadedById,
}: {
  file: File;
  extractedText: string | null;
  uploadedById: number;
}) => {
  const sourceFilePath = await saveUploadedFile(file);
  let createdId: number | null = null;
  let contentHash: string | null = null;
  let resolvedText: string | null = extractedText;

  try {
    const fileBytes = await readFile(sourceFilePath);
    const isPdfContent = fileBytes.subarray(0, 4).toString("ascii") === "%PDF";
    const isXls = file.name.toLocaleLowerCase("en-US").endsWith(".xls") && !isPdfContent;
    contentHash = createHash("sha256").update(fileBytes).digest("hex");
    const existingContent = await prisma.document.findFirst({
      where: {
        contentHash,
        extractionStatus: { not: DocumentStatus.FAILED },
      },
      select: { id: true, isCurrent: true },
    });

    let detectedDocument: {
      contour: DocumentContour;
      parserVersion: string;
      documentTypeId: 1 | 2;
      parsed: ParsedVatInvoice;
    };

    if (isXls) {
      detectedDocument = {
        contour: "UA" as const,
        parserVersion: "invoice-ua-xls-landpress-v1",
        documentTypeId: 2 as const,
        parsed: parseLandpressXls(fileBytes),
      };
    } else {
      resolvedText = extractedText || (await extractPdfText(sourceFilePath));
      detectedDocument = detectAndParseDocument(resolvedText);
    }

    const { contour, documentTypeId, parsed, parserVersion } = detectedDocument;
    const documentDate = parseDocumentDate(parsed.documentDate);
    const supplierTaxId = await resolvePartyTaxId({
      party: { ...parsed.supplier, name: normalizePartyName(parsed.supplier.name) },
      contour,
      findExistingTaxIds: (name) =>
        prisma.supplier.findMany({
          where: { name: { equals: name, mode: "insensitive" } },
          select: { taxId: true },
          take: 2,
        }),
    });
    const version = await getDocumentVersion({
      contour,
      documentDate,
      documentNumber: parsed.documentNumber,
      documentTypeId,
      supplierTaxId,
    });

    // An old file may be uploaded again only when there is no active version left
    // (for example, after a user deletes the current version). Otherwise it is a
    // duplicate of the history, not a new revision.
    if (existingContent && (existingContent.isCurrent || version.currentDocumentId !== null)) {
      throw new DuplicateDocumentError("Duplicate document");
    }

    if (
      documentTypeId === 2 &&
      version.currentDocumentId !== null &&
      (await hasEquivalentInvoiceContent({
        contour,
        parsed,
        supplierTaxId,
      }))
    ) {
      throw new DuplicateDocumentError("Equivalent invoice content already exists");
    }

    const needsVersionSelection = documentTypeId === 2 && version.currentDocumentId !== null;
    const created = await prisma.document.create({
      data: {
        sourceFileName: file.name,
        sourceFilePath,
        uploadedById,
        documentTypeId,
        contentHash,
        revision: version.revision,
        supersedesId: version.supersedesId ?? undefined,
        isCurrent: version.currentDocumentId === null,
        extractionStatus: DocumentStatus.PENDING,
      },
    });
    const createdDocumentId = created.id;
    createdId = createdDocumentId;

    if (documentTypeId === 1) {
      await ingestVatInvoice({
        documentId: createdDocumentId,
        contour,
        rawText: resolvedText ?? "",
      });
      if (version.currentDocumentId !== null) {
        await retireDocumentForNewVersion({
          documentId: version.currentDocumentId,
          documentTypeId,
          newDocumentId: createdDocumentId,
        });
      }
      await autoMatchTaxInvoice(createdDocumentId).catch(async () => {
        await prisma.document.update({
          where: { id: createdDocumentId },
          data: { taxCoverageStatus: "NO_CANDIDATES" },
        });
      });
    } else {
      await ingestInvoiceDocument({
        documentId: createdDocumentId,
        rawText: resolvedText ?? parsed.rawText,
        parsed,
        parserVersion,
      });
      if (version.supersedesId) {
        await copyDocumentIssueMappings({
          sourceDocumentId: version.supersedesId,
          targetDocumentId: createdDocumentId,
        });
      }
      if (!needsVersionSelection) {
        await rematchUncoveredTaxInvoicesForInvoice(createdDocumentId).catch((error) => {
          console.error("Could not rematch uncovered tax invoices", error);
        });
      }
    }

    return {
      fileName: file.name,
      errorKey: null,
      detail: null,
      replacedDocumentId: version.supersedesId,
      replacedDocumentName: version.replacedDocumentName,
      replacedRevision: version.replacedRevision,
      revision: version.revision,
      versionSelection:
        needsVersionSelection && version.currentDocument
          ? {
              previous: toInvoiceVersionSummary(version.currentDocument),
              uploaded: {
                id: createdDocumentId,
                sourceFileName: file.name,
                documentNumber: parsed.documentNumber,
                documentDate: parsed.documentDate,
                supplierName: normalizePartyName(parsed.supplier.name),
                recipientName: normalizePartyName(parsed.recipient.name),
                totalAmount: parsed.totalAmount,
                currency: contour === "RU" ? "RUB" : "UAH",
                revision: version.revision,
              },
            }
          : null,
    };
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      await deleteUploadedFile(sourceFilePath);

      return {
        fileName: file.name,
        errorKey: error.code,
        detail: error.detail ?? null,
      };
    }

    if (error instanceof DuplicateDocumentError) {
      await deleteUploadedFile(sourceFilePath);

      return {
        fileName: file.name,
        errorKey: "duplicateDocument" as const,
        detail: null,
      };
    }

    if (error instanceof InvoiceDetectionError) {
      if (createdId === null) {
        const created = await prisma.document.create({
          data: {
            sourceFileName: file.name,
            sourceFilePath,
            uploadedById,
            documentTypeId: 2,
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
            isCurrent: false,
            rawText: resolvedText,
            extractedAt: new Date(),
          },
        });
      }

      return {
        fileName: file.name,
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
        fileName: file.name,
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
          isCurrent: false,
        },
      });
    } else {
      const failedDocument = await prisma.document.create({
        data: {
          sourceFileName: file.name,
          sourceFilePath,
          uploadedById,
          documentTypeId: 2,
          contentHash: contentHash ?? undefined,
          extractionStatus: DocumentStatus.FAILED,
          reviewRequired: true,
        },
      });
      createdId = failedDocument.id;
    }

    return {
      fileName: file.name,
      errorKey: "parseFailed" as const,
      detail: error instanceof Error ? error.message : null,
    };
  }
};

class DuplicateDocumentError extends Error {}

const getDocumentVersion = async ({
  contour,
  documentDate,
  documentNumber,
  documentTypeId,
  supplierTaxId,
}: {
  contour: DocumentContour;
  documentDate: Date;
  documentNumber: string;
  documentTypeId: 1 | 2;
  supplierTaxId: string;
}) => {
  const existingSupplier = await prisma.supplier.findUnique({
    where: { taxId: supplierTaxId },
    select: { id: true },
  });

  if (!existingSupplier) {
    return {
      revision: 1,
      supersedesId: null,
      replacedDocumentName: null,
      replacedRevision: null,
      currentDocumentId: null,
      currentDocument: null,
    };
  }

  const previousDocument = await prisma.document.findFirst({
    where: {
      documentTypeId,
      documentContour: contour,
      documentNumber,
      documentDate,
      supplierId: existingSupplier.id,
    },
    select: versionDocumentSelect,
    orderBy: { revision: "desc" },
  });

  if (!previousDocument) {
    return {
      revision: 1,
      supersedesId: null,
      replacedDocumentName: null,
      replacedRevision: null,
      currentDocumentId: null,
      currentDocument: null,
    };
  }

  const currentDocument = previousDocument.isCurrent
    ? previousDocument
    : await prisma.document.findFirst({
        where: {
          documentTypeId,
          documentContour: contour,
          documentNumber,
          documentDate,
          supplierId: existingSupplier.id,
          isCurrent: true,
        },
        select: versionDocumentSelect,
        orderBy: { revision: "desc" },
      });

  return {
    revision: previousDocument.revision + 1,
    supersedesId: currentDocument?.id ?? previousDocument.id,
    replacedDocumentName: currentDocument?.sourceFileName ?? previousDocument.sourceFileName,
    replacedRevision: currentDocument?.revision ?? previousDocument.revision,
    currentDocumentId: currentDocument?.id ?? null,
    currentDocument,
  };
};

const versionDocumentSelect = {
  id: true,
  revision: true,
  sourceFileName: true,
  isCurrent: true,
  documentNumber: true,
  documentDate: true,
  totalAmount: true,
  currency: true,
  documentContour: true,
  supplier: { select: { name: true } },
  recipient: { select: { name: true } },
} as const;

const toInvoiceVersionSummary = (document: {
  id: number;
  sourceFileName: string;
  documentNumber: string | null;
  documentDate: Date | null;
  totalAmount: { toString(): string } | null;
  currency: string;
  documentContour: DocumentContour | null;
  revision: number;
  supplier: { name: string } | null;
  recipient: { name: string } | null;
}): InvoiceVersionSummary => ({
  id: document.id,
  sourceFileName: document.sourceFileName,
  documentNumber: document.documentNumber,
  documentDate: document.documentDate?.toISOString().slice(0, 10) ?? null,
  supplierName: document.supplier?.name ?? null,
  recipientName: document.recipient?.name ?? null,
  totalAmount: document.totalAmount?.toString() ?? null,
  currency: document.documentContour === "RU" ? "RUB" : document.currency,
  revision: document.revision,
});

const normalizeInvoiceText = (value: string | null) =>
  value?.trim().replace(/\s+/gu, " ").toLocaleLowerCase("uk-UA") ?? null;

const normalizeInvoiceNumber = (value: { toString(): string } | string | null) => {
  if (value === null) {
    return null;
  }

  return new Prisma.Decimal(value.toString()).toString();
};

const getParsedInvoiceLineSignature = (line: ParsedVatInvoice["lineItems"][number]) =>
  [
    normalizeInvoiceText(line.description),
    normalizeInvoiceNumber(line.quantity),
    normalizeInvoiceNumber(line.unitPrice),
    normalizeInvoiceText(line.vatRate),
    normalizeInvoiceNumber(line.lineBaseAmount),
    normalizeInvoiceNumber(line.lineVatAmount),
    normalizeInvoiceNumber(line.lineTotalAmount),
  ] as const;

const getStoredInvoiceLineSignature = (line: {
  description: string;
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  vatRate: string | null;
  lineBaseAmount: { toString(): string };
  lineVatAmount: { toString(): string };
  lineTotalAmount: { toString(): string } | null;
}) =>
  [
    normalizeInvoiceText(line.description),
    normalizeInvoiceNumber(line.quantity),
    normalizeInvoiceNumber(line.unitPrice),
    normalizeInvoiceText(line.vatRate),
    normalizeInvoiceNumber(line.lineBaseAmount),
    normalizeInvoiceNumber(line.lineVatAmount),
    normalizeInvoiceNumber(line.lineTotalAmount),
  ] as const;

const hasEquivalentInvoiceContent = async ({
  contour,
  parsed,
  supplierTaxId,
}: {
  contour: DocumentContour;
  parsed: ParsedVatInvoice;
  supplierTaxId: string;
}) => {
  const supplier = await prisma.supplier.findUnique({
    where: { taxId: supplierTaxId },
    select: { id: true },
  });
  if (!supplier) {
    return false;
  }

  const candidates = await prisma.document.findMany({
    where: {
      documentTypeId: 2,
      extractionStatus: { not: DocumentStatus.FAILED },
      documentContour: contour,
      documentNumber: parsed.documentNumber,
      documentDate: parseDocumentDate(parsed.documentDate),
      supplierId: supplier.id,
    },
    select: {
      totalAmount: true,
      recipient: { select: { name: true, taxId: true } },
      lineItems: {
        orderBy: { lineNo: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          vatRate: true,
          lineBaseAmount: true,
          lineVatAmount: true,
          lineTotalAmount: true,
        },
      },
    },
  });
  const parsedRecipientTaxId = parsed.recipient.taxId
    ? getStoredPartyTaxId({
        contour,
        taxId: parsed.recipient.taxId,
        kpp: parsed.recipient.kpp,
      })
    : null;
  const parsedLineSignatures = parsed.lineItems.map(getParsedInvoiceLineSignature);

  return candidates.some((candidate) => {
    const sameRecipient = parsedRecipientTaxId
      ? candidate.recipient?.taxId === parsedRecipientTaxId
      : normalizeInvoiceText(candidate.recipient?.name ?? null) ===
        normalizeInvoiceText(normalizePartyName(parsed.recipient.name));
    const sameLines =
      candidate.lineItems.length === parsedLineSignatures.length &&
      candidate.lineItems.every(
        (line, index) =>
          JSON.stringify(getStoredInvoiceLineSignature(line)) ===
          JSON.stringify(parsedLineSignatures[index]),
      );

    return (
      sameRecipient &&
      normalizeInvoiceNumber(candidate.totalAmount) ===
        normalizeInvoiceNumber(parsed.totalAmount) &&
      sameLines
    );
  });
};

const deleteUploadedFile = async (filePath: string) => {
  await unlink(filePath).catch(() => undefined);
};
