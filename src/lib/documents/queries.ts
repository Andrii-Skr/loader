import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { getDocumentMappingStatus } from "@/lib/documents/mapping-status";
import { prisma } from "@/lib/prisma";

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
    },
  }) satisfies Prisma.Document$lineItemsArgs;

export const getDashboardDocuments = cache(async () => {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        supplier: true,
        recipient: true,
        lineItems: {
          select: {
            publicationIssueConfirmedAt: true,
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

    return documents.map((document) => ({
      ...document,
      mappingStatus: getDocumentMappingStatus(document.lineItems),
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
