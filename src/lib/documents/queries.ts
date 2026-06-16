import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
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
  }) satisfies Prisma.Document$lineItemsArgs;

export const getDashboardDocuments = cache(async () => {
  try {
    return await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        supplier: true,
        recipient: true,
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
