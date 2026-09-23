import { cache } from "react";

import { DocumentStatus, Prisma } from "@/generated/prisma/client";
import { getDocumentMappingStatus } from "@/lib/documents/mapping-status";
import { prisma } from "@/lib/prisma";

const INVOICE_DOCUMENT_TYPE_ID = 2;
const selectableInvoiceStatuses: DocumentStatus[] = [
  DocumentStatus.PROCESSED,
  DocumentStatus.NEEDS_REVIEW,
];

const getInvoiceVersionKey = ({
  documentTypeId,
  documentContour,
  documentNumber,
  documentDate,
  supplierId,
}: {
  documentTypeId: number;
  documentContour: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  supplierId: number | null;
}) => {
  if (
    documentTypeId !== INVOICE_DOCUMENT_TYPE_ID ||
    documentContour === null ||
    documentContour === "" ||
    documentNumber === null ||
    documentNumber === "" ||
    documentDate === null ||
    supplierId === null
  ) {
    return null;
  }

  return [documentContour, documentNumber, documentDate.toISOString(), supplierId].join("|");
};

const getDocumentDetailsLineItemsArgs = () =>
  ({
    orderBy: { lineNo: "asc" as const },
    include: {
      publicationIssue: {
        include: {
          publication: {
            select: {
              displayName: true,
              _count: {
                select: {
                  mappings: true,
                },
              },
            },
          },
          issueNumber: {
            select: {
              canonicalValue: true,
            },
          },
        },
      },
      externalMatches: {
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
        select: {
          externalEditionName: true,
          externalIssueNumber: true,
          quantity: true,
        },
      },
    },
  }) satisfies Prisma.Document$lineItemsArgs;

export const getDashboardDocuments = cache(async () => {
  try {
    const documents = await prisma.document.findMany({
      where: { isCurrent: true },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: true,
        recipient: true,
        lineItems: {
          select: {
            publicationIssueConfirmedAt: true,
            externalMatchCount: true,
            publicationIssue: {
              select: {
                publication: {
                  select: {
                    _count: {
                      select: {
                        mappings: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            lineItems: true,
          },
        },
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const versionFilters = documents.flatMap((document) => {
      if (
        document.documentTypeId !== INVOICE_DOCUMENT_TYPE_ID ||
        document.documentContour === null ||
        document.documentNumber === null ||
        document.documentNumber === "" ||
        document.documentDate === null ||
        document.supplierId === null
      ) {
        return [];
      }

      return [
        {
          documentTypeId: INVOICE_DOCUMENT_TYPE_ID,
          documentContour: document.documentContour,
          documentNumber: document.documentNumber,
          documentDate: document.documentDate,
          supplierId: document.supplierId,
        },
      ];
    });
    const invoiceVersions =
      versionFilters.length > 0
        ? await prisma.document.findMany({
            where: {
              AND: [
                { OR: versionFilters },
                {
                  OR: [
                    { isCurrent: true },
                    { extractionStatus: { in: selectableInvoiceStatuses } },
                  ],
                },
              ],
            },
            orderBy: [{ revision: "desc" }, { id: "desc" }],
            select: {
              id: true,
              documentTypeId: true,
              documentContour: true,
              documentNumber: true,
              documentDate: true,
              supplierId: true,
              sourceFileName: true,
              revision: true,
              isCurrent: true,
              totalAmount: true,
              currency: true,
              supplier: { select: { name: true } },
              recipient: { select: { name: true } },
            },
          })
        : [];
    const invoiceVersionsByKey = new Map<string, (typeof invoiceVersions)[number][]>();

    for (const version of invoiceVersions) {
      const key = getInvoiceVersionKey(version);
      if (!key) {
        continue;
      }

      const versions = invoiceVersionsByKey.get(key) ?? [];
      versions.push(version);
      invoiceVersionsByKey.set(key, versions);
    }

    return documents.map((document) => ({
      ...document,
      mappingStatus: getDocumentMappingStatus(document.lineItems),
      versionHistory: (() => {
        const key = getInvoiceVersionKey(document);

        return key ? (invoiceVersionsByKey.get(key) ?? []) : [];
      })(),
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return [];
    }

    throw error;
  }
});

export const getDashboardDocumentById = cache(async (documentId: number) => {
  try {
    return await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        supplier: true,
        recipient: true,
        invoiceCoverages: {
          include: {
            taxInvoiceDocument: {
              select: { id: true, sourceFileName: true, documentNumber: true },
            },
          },
        },
        taxCoverages: {
          include: {
            invoiceDocument: {
              select: { id: true, sourceFileName: true, documentNumber: true },
            },
          },
        },
        lineItems: getDocumentDetailsLineItemsArgs(),
        uploadedBy: {
          select: {
            id: true,
            login: true,
            name: true,
            email: true,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return null;
    }

    throw error;
  }
});
