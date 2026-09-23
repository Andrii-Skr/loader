import { DocumentStatus, TaxCoverageStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const INVOICE_DOCUMENT_TYPE_ID = 2;

export const selectInvoiceDocumentVersion = async ({ documentId }: { documentId: number }) => {
  const taxInvoiceDocumentIds = await prisma.$transaction(async (tx) => {
    const selectedDocument = await tx.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        documentTypeId: true,
        extractionStatus: true,
        documentContour: true,
        documentNumber: true,
        documentDate: true,
        supplierId: true,
        recipientId: true,
      },
    });

    if (
      !selectedDocument ||
      selectedDocument.documentTypeId !== INVOICE_DOCUMENT_TYPE_ID ||
      (selectedDocument.extractionStatus !== DocumentStatus.PROCESSED &&
        selectedDocument.extractionStatus !== DocumentStatus.NEEDS_REVIEW) ||
      !selectedDocument.documentContour ||
      !selectedDocument.documentNumber ||
      !selectedDocument.documentDate ||
      !selectedDocument.supplierId
    ) {
      throw new Error("Invoice version was not found.");
    }

    const versions = await tx.document.findMany({
      where: {
        documentTypeId: INVOICE_DOCUMENT_TYPE_ID,
        documentContour: selectedDocument.documentContour,
        documentNumber: selectedDocument.documentNumber,
        documentDate: selectedDocument.documentDate,
        supplierId: selectedDocument.supplierId,
      },
      select: { id: true, isCurrent: true },
    });

    if (versions.length === 0) {
      throw new Error("Invoice version group was not found.");
    }

    const currentDocument = versions.find((document) => document.isCurrent);
    if (currentDocument?.id === selectedDocument.id) {
      return [];
    }

    const versionIds = versions.map((document) => document.id);
    const coverages = await tx.documentTaxCoverage.findMany({
      where: { invoiceDocumentId: { in: versionIds } },
      select: { taxInvoiceDocumentId: true },
    });
    const taxInvoiceIdsToRecheck = new Set(
      coverages.map((coverage) => coverage.taxInvoiceDocumentId),
    );

    if (selectedDocument.recipientId !== null) {
      const taxInvoices = await tx.document.findMany({
        where: {
          documentTypeId: 1,
          isCurrent: true,
          supplierId: selectedDocument.supplierId,
          recipientId: selectedDocument.recipientId,
          OR: [{ taxCoverages: { none: {} } }, { id: { in: Array.from(taxInvoiceIdsToRecheck) } }],
        },
        select: { id: true },
      });

      for (const taxInvoice of taxInvoices) {
        taxInvoiceIdsToRecheck.add(taxInvoice.id);
      }
    }

    await tx.documentTaxCoverage.deleteMany({
      where: { invoiceDocumentId: { in: versionIds } },
    });
    if (taxInvoiceIdsToRecheck.size > 0) {
      await tx.document.updateMany({
        where: {
          id: { in: Array.from(taxInvoiceIdsToRecheck) },
          documentTypeId: 1,
          isCurrent: true,
        },
        data: { taxCoverageStatus: TaxCoverageStatus.NEEDS_SELECTION },
      });
    }
    await tx.document.updateMany({
      where: { id: { in: versionIds } },
      data: { isCurrent: false, hasTaxInvoice: false },
    });
    await tx.document.update({
      where: { id: selectedDocument.id },
      data: { isCurrent: true },
    });

    return Array.from(taxInvoiceIdsToRecheck);
  });

  return { taxInvoiceDocumentIds };
};

type ReusableDocumentIssueMatch = {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number;
  externalIssueNumber: string;
};

export const copyDocumentIssueMappings = async ({
  sourceDocumentId,
  targetDocumentId,
}: {
  sourceDocumentId: number;
  targetDocumentId: number;
}) => {
  const sourceLines = await prisma.specialDocument.findMany({
    where: {
      documentId: sourceDocumentId,
      publicationIssueConfirmedAt: { not: null },
      publicationIssueId: { not: null },
    },
    select: {
      publicationIssueId: true,
      _count: {
        select: {
          externalMatches: true,
        },
      },
      externalMatches: {
        where: {
          isPrimary: true,
          externalIssueId: { not: null },
          externalIssueNumber: { not: null },
        },
        select: {
          externalEditionId: true,
          externalEditionName: true,
          externalIssueId: true,
          externalIssueNumber: true,
        },
      },
    },
  });

  const matchesByPublicationIssueId = new Map<number, ReusableDocumentIssueMatch>();
  const ambiguousPublicationIssueIds = new Set<number>();

  for (const line of sourceLines) {
    const match = line.externalMatches[0];

    if (
      line.publicationIssueId === null ||
      ambiguousPublicationIssueIds.has(line.publicationIssueId) ||
      // A split allocation cannot safely follow a revised invoice: its quantities and amounts
      // may have changed. Preserve only an unambiguous one-to-one issue selection.
      line._count.externalMatches !== 1 ||
      line.externalMatches.length !== 1 ||
      match?.externalIssueId === null ||
      match.externalIssueNumber === null
    ) {
      continue;
    }

    const previous = matchesByPublicationIssueId.get(line.publicationIssueId);
    const next = {
      externalEditionId: match.externalEditionId,
      externalEditionName: match.externalEditionName,
      externalIssueId: match.externalIssueId,
      externalIssueNumber: match.externalIssueNumber,
    };

    if (
      previous &&
      (previous.externalEditionId !== next.externalEditionId ||
        previous.externalIssueId !== next.externalIssueId)
    ) {
      matchesByPublicationIssueId.delete(line.publicationIssueId);
      ambiguousPublicationIssueIds.add(line.publicationIssueId);
      continue;
    }

    matchesByPublicationIssueId.set(line.publicationIssueId, next);
  }

  if (matchesByPublicationIssueId.size === 0) {
    return 0;
  }

  const targetLines = await prisma.specialDocument.findMany({
    where: {
      documentId: targetDocumentId,
      publicationIssueId: { in: Array.from(matchesByPublicationIssueId.keys()) },
      externalMatches: { none: {} },
    },
    select: {
      id: true,
      publicationIssueId: true,
      quantity: true,
      unitPrice: true,
      lineBaseAmount: true,
      lineVatAmount: true,
      lineTotalAmount: true,
      document: { select: { currency: true } },
    },
  });

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      targetLines.flatMap((line) => {
        const match =
          line.publicationIssueId === null
            ? undefined
            : matchesByPublicationIssueId.get(line.publicationIssueId);

        if (!match) {
          return [];
        }

        return [
          tx.specialDocumentExternalMatch.create({
            data: {
              specialDocumentId: line.id,
              ...match,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineBaseAmount: line.lineBaseAmount,
              lineVatAmount: line.lineVatAmount,
              lineTotalAmount: line.lineTotalAmount,
              currency: line.document.currency,
              isPrimary: true,
            },
          }),
          tx.specialDocument.update({
            where: { id: line.id },
            data: {
              publicationIssueConfirmedAt: new Date(),
              matchedExternalEditionId: match.externalEditionId,
              matchedExternalIssueId: match.externalIssueId,
              matchedExternalIssueNumber: match.externalIssueNumber,
              externalMatchCount: 1,
              hasMultipleExternalMatches: false,
            },
          }),
        ];
      }),
    );
  });

  return targetLines.length;
};
