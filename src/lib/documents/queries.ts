import { cache } from "react";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const getDashboardDocuments = cache(async () => {
  try {
    return await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        supplier: true,
        recipient: true,
        lineItems: {
          orderBy: { lineNo: "asc" },
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
        lineItems: {
          orderBy: { lineNo: "asc" },
        },
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
