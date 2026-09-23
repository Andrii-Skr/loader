import { DocumentStatus, type Prisma, TaxCoverageStatus } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

const TAX_INVOICE_TYPE_ID = 1;
const INVOICE_TYPE_ID = 2;
const MAX_TAX_INVOICES_PER_INVOICE = 2;

type CoverageLine = {
  publicationIssueId: number | null;
  quantity: Prisma.Decimal;
};

type CandidateInvoice = {
  id: number;
  documentNumber: string | null;
  documentDate: Date | null;
  sourceFileName: string;
  lineItems: CoverageLine[];
  invoiceCoverages: Array<{
    taxInvoiceDocument: { lineItems: CoverageLine[] };
  }>;
};

export type TaxCoverageCandidate = {
  invoiceDocumentId: number;
  sourceFileName: string;
  documentNumber: string | null;
  documentDate: Date | null;
  matchedLineCount: number;
  totalLineCount: number;
};

const quantityByIssue = (lines: CoverageLine[]) => {
  const result = new Map<number, number>();

  for (const line of lines) {
    if (line.publicationIssueId === null) {
      return null;
    }

    result.set(
      line.publicationIssueId,
      (result.get(line.publicationIssueId) ?? 0) + Number(line.quantity),
    );
  }

  return result;
};

const fitsOutstandingInvoice = ({
  taxLines,
  invoice,
}: { taxLines: CoverageLine[]; invoice: CandidateInvoice }) => {
  const taxQuantities = quantityByIssue(taxLines);
  const invoiceQuantities = quantityByIssue(invoice.lineItems);

  if (
    !taxQuantities ||
    !invoiceQuantities ||
    taxQuantities.size === 0 ||
    invoice.invoiceCoverages.length >= MAX_TAX_INVOICES_PER_INVOICE
  ) {
    return false;
  }

  const coveredQuantities = new Map<number, number>();
  for (const coverage of invoice.invoiceCoverages) {
    const quantities = quantityByIssue(coverage.taxInvoiceDocument.lineItems);
    if (!quantities) continue;

    for (const [issueId, quantity] of quantities) {
      coveredQuantities.set(issueId, (coveredQuantities.get(issueId) ?? 0) + quantity);
    }
  }

  for (const [issueId, taxQuantity] of taxQuantities) {
    const remaining = (invoiceQuantities.get(issueId) ?? 0) - (coveredQuantities.get(issueId) ?? 0);
    if (taxQuantity > remaining + Number.EPSILON) {
      return false;
    }
  }

  return true;
};

const taxCandidateInclude = {
  lineItems: { select: { publicationIssueId: true, quantity: true } },
  supplier: { select: { id: true } },
  recipient: { select: { id: true } },
} satisfies Prisma.DocumentInclude;

const invoiceCandidateInclude = {
  lineItems: { select: { publicationIssueId: true, quantity: true } },
  invoiceCoverages: {
    include: {
      taxInvoiceDocument: {
        select: { lineItems: { select: { publicationIssueId: true, quantity: true } } },
      },
    },
  },
} satisfies Prisma.DocumentInclude;

export const getTaxCoverageCandidates = async (taxInvoiceDocumentId: number) => {
  const taxInvoice = await prisma.document.findUnique({
    where: { id: taxInvoiceDocumentId },
    include: taxCandidateInclude,
  });

  if (
    !taxInvoice ||
    taxInvoice.documentTypeId !== TAX_INVOICE_TYPE_ID ||
    !taxInvoice.supplierId ||
    !taxInvoice.recipientId ||
    !taxInvoice.isCurrent
  ) {
    return [] as TaxCoverageCandidate[];
  }

  const invoices = await prisma.document.findMany({
    where: {
      documentTypeId: INVOICE_TYPE_ID,
      isCurrent: true,
      supplierId: taxInvoice.supplierId,
      recipientId: taxInvoice.recipientId,
    },
    select: {
      id: true,
      sourceFileName: true,
      documentNumber: true,
      documentDate: true,
      ...invoiceCandidateInclude,
    },
    orderBy: [{ documentDate: "desc" }, { id: "desc" }],
  });

  return invoices
    .filter((invoice) => fitsOutstandingInvoice({ taxLines: taxInvoice.lineItems, invoice }))
    .map((invoice) => ({
      invoiceDocumentId: invoice.id,
      sourceFileName: invoice.sourceFileName,
      documentNumber: invoice.documentNumber,
      documentDate: invoice.documentDate,
      matchedLineCount: taxInvoice.lineItems.length,
      totalLineCount: invoice.lineItems.length,
    }));
};

const refreshInvoiceTaxFlag = async (tx: Prisma.TransactionClient, invoiceDocumentId: number) => {
  const invoice = await tx.document.findUnique({
    where: { id: invoiceDocumentId },
    select: {
      lineItems: { select: { publicationIssueId: true, quantity: true } },
      invoiceCoverages: {
        select: {
          taxInvoiceDocument: {
            select: { lineItems: { select: { publicationIssueId: true, quantity: true } } },
          },
        },
      },
    },
  });

  if (!invoice) return;

  const required = quantityByIssue(invoice.lineItems);
  const covered = new Map<number, number>();
  for (const coverage of invoice.invoiceCoverages) {
    const quantities = quantityByIssue(coverage.taxInvoiceDocument.lineItems);
    if (!quantities) continue;
    for (const [issueId, quantity] of quantities) {
      covered.set(issueId, (covered.get(issueId) ?? 0) + quantity);
    }
  }

  const hasTaxInvoice =
    required !== null &&
    required.size > 0 &&
    Array.from(required).every(([issueId, quantity]) => (covered.get(issueId) ?? 0) >= quantity);

  await tx.document.update({ where: { id: invoiceDocumentId }, data: { hasTaxInvoice } });
};

export const assignTaxInvoiceCoverage = async ({
  taxInvoiceDocumentId,
  invoiceDocumentId,
  isAutomatic,
}: {
  taxInvoiceDocumentId: number;
  invoiceDocumentId: number;
  isAutomatic: boolean;
}) =>
  prisma.$transaction(async (tx) => {
    const [taxInvoice, invoice, coverageCount, existingCoverage] = await Promise.all([
      tx.document.findUnique({
        where: { id: taxInvoiceDocumentId },
        include: { lineItems: { select: { publicationIssueId: true, quantity: true } } },
      }),
      tx.document.findUnique({
        where: { id: invoiceDocumentId },
        include: {
          lineItems: { select: { publicationIssueId: true, quantity: true } },
          invoiceCoverages: {
            include: {
              taxInvoiceDocument: {
                select: { lineItems: { select: { publicationIssueId: true, quantity: true } } },
              },
            },
          },
        },
      }),
      tx.documentTaxCoverage.count({ where: { invoiceDocumentId } }),
      tx.documentTaxCoverage.findUnique({ where: { taxInvoiceDocumentId } }),
    ]);

    if (
      !taxInvoice ||
      !invoice ||
      taxInvoice.documentTypeId !== TAX_INVOICE_TYPE_ID ||
      !taxInvoice.isCurrent ||
      invoice.documentTypeId !== INVOICE_TYPE_ID ||
      !invoice.isCurrent ||
      taxInvoice.supplierId !== invoice.supplierId ||
      taxInvoice.recipientId !== invoice.recipientId ||
      existingCoverage ||
      coverageCount >= MAX_TAX_INVOICES_PER_INVOICE ||
      !fitsOutstandingInvoice({ taxLines: taxInvoice.lineItems, invoice })
    ) {
      throw new Error("The selected documents can no longer be linked.");
    }

    await tx.documentTaxCoverage.create({
      data: { invoiceDocumentId, taxInvoiceDocumentId, isAutomatic },
    });
    await tx.document.update({
      where: { id: taxInvoiceDocumentId },
      data: { taxCoverageStatus: TaxCoverageStatus.MATCHED },
    });
    await refreshInvoiceTaxFlag(tx, invoiceDocumentId);
  });

export const autoMatchTaxInvoice = async (taxInvoiceDocumentId: number) => {
  const candidates = await getTaxCoverageCandidates(taxInvoiceDocumentId);

  if (candidates.length === 1 && candidates[0]) {
    await assignTaxInvoiceCoverage({
      taxInvoiceDocumentId,
      invoiceDocumentId: candidates[0].invoiceDocumentId,
      isAutomatic: true,
    });
    return TaxCoverageStatus.MATCHED;
  }

  const status =
    candidates.length === 0 ? TaxCoverageStatus.NO_CANDIDATES : TaxCoverageStatus.NEEDS_SELECTION;
  await prisma.document.update({
    where: { id: taxInvoiceDocumentId },
    data: { taxCoverageStatus: status },
  });
  return status;
};

export const rematchUncoveredTaxInvoicesForInvoice = async (invoiceDocumentId: number) => {
  const invoice = await prisma.document.findUnique({
    where: { id: invoiceDocumentId },
    select: {
      documentTypeId: true,
      isCurrent: true,
      supplierId: true,
      recipientId: true,
    },
  });

  if (
    !invoice ||
    invoice.documentTypeId !== INVOICE_TYPE_ID ||
    !invoice.isCurrent ||
    invoice.supplierId === null ||
    invoice.recipientId === null
  ) {
    return;
  }

  const taxInvoices = await prisma.document.findMany({
    where: {
      documentTypeId: TAX_INVOICE_TYPE_ID,
      isCurrent: true,
      supplierId: invoice.supplierId,
      recipientId: invoice.recipientId,
      taxCoverages: { none: {} },
      taxCoverageStatus: {
        in: [TaxCoverageStatus.NO_CANDIDATES, TaxCoverageStatus.NEEDS_SELECTION],
      },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const taxInvoice of taxInvoices) {
    await autoMatchTaxInvoice(taxInvoice.id);
  }
};

export const deleteDocumentWithCoverageRefresh = async ({
  documentId,
  documentTypeId,
}: {
  documentId: number;
  documentTypeId: number;
}) => {
  const { taxInvoiceIdsToRecheck, sourceFilePaths } = await prisma.$transaction(async (tx) => {
    const document = await tx.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        isCurrent: true,
        documentContour: true,
        documentNumber: true,
        documentDate: true,
        supplierId: true,
        sourceFilePath: true,
      },
    });
    if (!document) throw new Error("Document was not found.");

    let documentsToDelete: Array<{ id: number; sourceFilePath: string | null }> = [document];
    if (
      documentTypeId === INVOICE_TYPE_ID &&
      document.documentContour &&
      document.documentNumber &&
      document.documentDate &&
      document.supplierId !== null
    ) {
      const versions = await tx.document.findMany({
        where: {
          documentTypeId: INVOICE_TYPE_ID,
          documentContour: document.documentContour,
          documentNumber: document.documentNumber,
          documentDate: document.documentDate,
          supplierId: document.supplierId,
        },
        select: { id: true, isCurrent: true, sourceFilePath: true },
      });
      if (document.isCurrent || !versions.some((version) => version.isCurrent)) {
        documentsToDelete = versions;
      }
    }
    const documentIds = documentsToDelete.map((version) => version.id);
    const coverages = await tx.documentTaxCoverage.findMany({
      where:
        documentTypeId === TAX_INVOICE_TYPE_ID
          ? { taxInvoiceDocumentId: documentId }
          : { invoiceDocumentId: { in: documentIds } },
      select: {
        invoiceDocumentId: true,
        taxInvoiceDocumentId: true,
        taxInvoiceDocument: { select: { isCurrent: true } },
      },
    });

    if (documentIds.length === 1) {
      await tx.document.delete({ where: { id: documentId } });
    } else {
      await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    }

    const sourceFilePaths = documentsToDelete.flatMap((version) =>
      version.sourceFilePath ? [version.sourceFilePath] : [],
    );

    if (documentTypeId === TAX_INVOICE_TYPE_ID) {
      for (const invoiceDocumentId of new Set(coverages.map((item) => item.invoiceDocumentId))) {
        await refreshInvoiceTaxFlag(tx, invoiceDocumentId);
      }
      return { taxInvoiceIdsToRecheck: [], sourceFilePaths };
    }

    const currentTaxInvoiceIds = coverages
      .filter((item) => item.taxInvoiceDocument.isCurrent)
      .map((item) => item.taxInvoiceDocumentId);
    if (currentTaxInvoiceIds.length > 0) {
      await tx.document.updateMany({
        where: { id: { in: currentTaxInvoiceIds } },
        data: { taxCoverageStatus: TaxCoverageStatus.NO_CANDIDATES },
      });
    }
    return { taxInvoiceIdsToRecheck: currentTaxInvoiceIds, sourceFilePaths };
  });

  for (const taxInvoiceDocumentId of taxInvoiceIdsToRecheck) {
    try {
      await autoMatchTaxInvoice(taxInvoiceDocumentId);
    } catch (error) {
      console.error("Could not rematch tax invoice after invoice deletion", error);
    }
  }
  return sourceFilePaths;
};

export const retireDocumentForNewVersion = async ({
  documentId,
  documentTypeId,
  newDocumentId,
}: {
  documentId: number;
  documentTypeId: 1 | 2;
  newDocumentId: number;
}) =>
  prisma.$transaction(async (tx) => {
    const replacement = await tx.document.findUnique({
      where: { id: newDocumentId },
      select: { documentTypeId: true, isCurrent: true, extractionStatus: true },
    });
    if (
      !replacement ||
      replacement.documentTypeId !== documentTypeId ||
      replacement.isCurrent ||
      (replacement.extractionStatus !== DocumentStatus.PROCESSED &&
        replacement.extractionStatus !== DocumentStatus.NEEDS_REVIEW)
    ) {
      throw new Error("Replacement document is not ready.");
    }

    const coverages = await tx.documentTaxCoverage.findMany({
      where:
        documentTypeId === TAX_INVOICE_TYPE_ID
          ? { taxInvoiceDocumentId: documentId }
          : { invoiceDocumentId: documentId },
      select: { invoiceDocumentId: true, taxInvoiceDocumentId: true },
    });

    await tx.documentTaxCoverage.deleteMany({
      where:
        documentTypeId === TAX_INVOICE_TYPE_ID
          ? { taxInvoiceDocumentId: documentId }
          : { invoiceDocumentId: documentId },
    });
    const retired = await tx.document.updateMany({
      where: { id: documentId, isCurrent: true, documentTypeId },
      data: { isCurrent: false, hasTaxInvoice: false },
    });
    if (retired.count !== 1) {
      throw new Error("Current document version changed.");
    }
    await tx.document.update({ where: { id: newDocumentId }, data: { isCurrent: true } });

    await Promise.all(
      [...new Set(coverages.map((coverage) => coverage.invoiceDocumentId))].map(
        (invoiceDocumentId) => refreshInvoiceTaxFlag(tx, invoiceDocumentId),
      ),
    );

    return documentTypeId === INVOICE_TYPE_ID
      ? coverages.map((coverage) => coverage.taxInvoiceDocumentId)
      : [];
  });
