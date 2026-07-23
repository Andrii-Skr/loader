import { cache } from "react";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getExactCandidateCounts } from "@/lib/publication-mappings/service";
import type {
  DocumentExternalMatchDetailDto,
  DocumentIssueMatchDto,
  DocumentLineAllocationDto,
  PublicationIssueDocumentOccurrence,
  PublicationIssueMatchSummary,
  PublicationIssueRegistryFilter,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

const toDocumentMatchDetail = (match: {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number | null;
  externalIssueNumber: string | null;
  quantity: { toString(): string };
  unitPrice: { toString(): string } | null;
  lineBaseAmount: { toString(): string } | null;
  lineVatAmount: { toString(): string } | null;
  lineTotalAmount: { toString(): string } | null;
  currency: string;
  isPrimary: boolean;
}): DocumentExternalMatchDetailDto => ({
  externalEditionId: match.externalEditionId,
  externalEditionName: match.externalEditionName,
  externalIssueId: match.externalIssueId,
  externalIssueNumber: match.externalIssueNumber,
  quantity: match.quantity.toString(),
  unitPrice: match.unitPrice?.toString() ?? null,
  lineBaseAmount: match.lineBaseAmount?.toString() ?? null,
  lineVatAmount: match.lineVatAmount?.toString() ?? null,
  lineTotalAmount: match.lineTotalAmount?.toString() ?? null,
  currency: match.currency,
  isPrimary: match.isPrimary,
});

const REGISTRY_OCCURRENCE_LIMIT = 10;

const buildRegistryWhere = (
  filter: PublicationIssueRegistryFilter,
  documentId?: number,
): Prisma.PublicationIssueWhereInput => {
  const documentScopedWhere: Prisma.PublicationIssueWhereInput = documentId
    ? {
        lineItems: {
          some: {
            documentId,
          },
        },
      }
    : {};

  if (filter === "matched") {
    return {
      publication: { is: { mappings: { some: {} } } },
    };
  }

  if (filter === "unmatched") {
    return {};
  }

  if (filter === "document-unmatched") {
    return documentScopedWhere;
  }

  return {};
};

const mapSummary = (publicationIssue: {
  id: number;
  publication: {
    id: number;
    displayName: string;
    mappings: Array<{
      id: number;
      externalEditionId: number;
      externalEditionName: string;
      source: { code: string; displayName: string };
    }>;
  };
  issueNumber: {
    id: number;
    rawValue: string;
    canonicalValue: string;
  };
  _count: {
    lineItems: number;
  };
}): PublicationIssueMatchSummary => ({
  publicationIssueId: publicationIssue.id,
  publicationId: publicationIssue.publication.id,
  issueNumberId: publicationIssue.issueNumber.id,
  publicationName: publicationIssue.publication.displayName,
  parsedIssueNumber: publicationIssue.issueNumber.rawValue,
  canonicalIssueNumber: publicationIssue.issueNumber.canonicalValue,
  publicationMappingCount: publicationIssue.publication.mappings.length,
  publicationCandidateCount: 0,
  issueNumberCandidateCount: 0,
  fullyMatched: false,
  publicationMappings: publicationIssue.publication.mappings.map((mapping) => ({
    id: mapping.id,
    sourceCode: mapping.source.code,
    sourceDisplayName: mapping.source.displayName,
    externalEditionId: mapping.externalEditionId,
    externalEditionName: mapping.externalEditionName,
  })),
});

const getConfirmedDocumentMatchCounts = async ({
  documentId,
  publicationIssueIds,
}: {
  documentId?: number;
  publicationIssueIds: number[];
}) => {
  if (publicationIssueIds.length === 0) {
    return new Map<number, number>();
  }

  const rows = await prisma.specialDocument.groupBy({
    by: ["publicationIssueId"],
    where: {
      publicationIssueId: { in: publicationIssueIds },
      publicationIssueConfirmedAt: { not: null },
      externalMatches: { some: {} },
      ...(documentId ? { documentId } : {}),
    },
    _count: {
      _all: true,
    },
  });

  return new Map(
    rows.flatMap((row) =>
      row.publicationIssueId === null ? [] : [[row.publicationIssueId, row._count._all] as const],
    ),
  );
};

const mapDocumentOccurrences = (
  lineItems: Array<{
    description: string;
    rawRowText: string | null;
    document: {
      documentNumber: string | null;
      sourceFileName: string;
    };
  }>,
): PublicationIssueDocumentOccurrence[] =>
  lineItems.map((lineItem) => ({
    documentNumber: lineItem.document.documentNumber,
    sourceFileName: lineItem.document.sourceFileName,
    description: lineItem.description,
    rawRowText: lineItem.rawRowText,
  }));

const getSavedDocumentIssueMatches = async ({
  documentId,
  publicationIssueIds,
}: {
  documentId?: number;
  publicationIssueIds: number[];
}): Promise<{
  detailMap: Map<number, DocumentExternalMatchDetailDto[]>;
  summaryMap: Map<number, DocumentIssueMatchDto>;
}> => {
  if (!documentId || publicationIssueIds.length === 0) {
    return {
      detailMap: new Map<number, DocumentExternalMatchDetailDto[]>(),
      summaryMap: new Map<number, DocumentIssueMatchDto>(),
    };
  }

  const [rows, detailRows] = await Promise.all([
    prisma.specialDocument.findMany({
      where: {
        documentId,
        publicationIssueId: { in: publicationIssueIds },
        matchedExternalEditionId: { not: null },
        matchedExternalIssueId: { not: null },
        matchedExternalIssueNumber: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        publicationIssueId: true,
        matchedExternalEditionId: true,
        matchedExternalIssueId: true,
        matchedExternalIssueNumber: true,
      },
    }),
    prisma.specialDocumentExternalMatch.findMany({
      where: {
        specialDocument: {
          documentId,
          publicationIssueId: { in: publicationIssueIds },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: {
        externalEditionId: true,
        externalEditionName: true,
        externalIssueId: true,
        externalIssueNumber: true,
        quantity: true,
        unitPrice: true,
        lineBaseAmount: true,
        lineVatAmount: true,
        lineTotalAmount: true,
        currency: true,
        isPrimary: true,
        specialDocument: {
          select: {
            publicationIssueId: true,
          },
        },
      },
    }),
  ]);

  const detailMap = new Map<number, DocumentExternalMatchDetailDto[]>();

  for (const row of detailRows) {
    const publicationIssueId = row.specialDocument.publicationIssueId;

    if (publicationIssueId === null) {
      continue;
    }

    const matches = detailMap.get(publicationIssueId) ?? [];

    matches.push({
      externalEditionId: row.externalEditionId,
      externalEditionName: row.externalEditionName,
      externalIssueId: row.externalIssueId,
      externalIssueNumber: row.externalIssueNumber,
      quantity: row.quantity.toString(),
      unitPrice: row.unitPrice?.toString() ?? null,
      lineBaseAmount: row.lineBaseAmount?.toString() ?? null,
      lineVatAmount: row.lineVatAmount?.toString() ?? null,
      lineTotalAmount: row.lineTotalAmount?.toString() ?? null,
      currency: row.currency,
      isPrimary: row.isPrimary,
    });

    detailMap.set(publicationIssueId, matches);
  }

  const summaryEntries = rows.flatMap((row): Array<readonly [number, DocumentIssueMatchDto]> => {
    if (
      row.publicationIssueId === null ||
      row.matchedExternalEditionId === null ||
      row.matchedExternalIssueId === null ||
      row.matchedExternalIssueNumber === null
    ) {
      return [];
    }

    return [
      [
        row.publicationIssueId,
        {
          externalEditionId: row.matchedExternalEditionId,
          externalIssueId: row.matchedExternalIssueId,
          externalIssueNumber: row.matchedExternalIssueNumber,
        } satisfies DocumentIssueMatchDto,
      ] as const,
    ];
  });

  const summaryMap = new Map<number, DocumentIssueMatchDto>(summaryEntries);

  return {
    detailMap,
    summaryMap,
  };
};

export const getPublicationIssueOccurrences = async (
  publicationIssueId: number,
): Promise<PublicationIssueDocumentOccurrence[]> => {
  const item = await prisma.publicationIssue.findUnique({
    where: { id: publicationIssueId },
    select: {
      lineItems: {
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          description: true,
          rawRowText: true,
          document: {
            select: {
              documentNumber: true,
              sourceFileName: true,
            },
          },
        },
      },
    },
  });

  return mapDocumentOccurrences(item?.lineItems ?? []);
};

export const getDocumentLineAllocations = async (
  documentId: number,
): Promise<DocumentLineAllocationDto[]> => {
  const rows = await prisma.specialDocument.findMany({
    where: { documentId },
    orderBy: { lineNo: "asc" },
    select: {
      id: true,
      lineNo: true,
      description: true,
      publicationIssueId: true,
      quantity: true,
      unitPrice: true,
      vatRate: true,
      lineBaseAmount: true,
      lineVatAmount: true,
      lineTotalAmount: true,
      document: { select: { currency: true } },
      externalMatches: {
        orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
        select: {
          externalEditionId: true,
          externalEditionName: true,
          externalIssueId: true,
          externalIssueNumber: true,
          quantity: true,
          unitPrice: true,
          lineBaseAmount: true,
          lineVatAmount: true,
          lineTotalAmount: true,
          currency: true,
          isPrimary: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    specialDocumentId: row.id,
    lineNo: row.lineNo,
    description: row.description,
    publicationIssueId: row.publicationIssueId,
    quantity: row.quantity.toString(),
    unitPrice: row.unitPrice.toString(),
    vatRate: row.vatRate,
    lineBaseAmount: row.lineBaseAmount.toString(),
    lineVatAmount: row.lineVatAmount.toString(),
    lineTotalAmount: row.lineTotalAmount?.toString() ?? null,
    currency: row.document.currency,
    allocations: row.externalMatches.map(toDocumentMatchDetail),
  }));
};

export const getPublicationIssueRegistry = cache(
  async (
    filter: PublicationIssueRegistryFilter,
    documentId?: number,
  ): Promise<PublicationIssueRegistryItem[]> => {
    const items = await prisma.publicationIssue.findMany({
      where: buildRegistryWhere(filter, documentId),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        publication: {
          select: {
            id: true,
            displayName: true,
            mappings: {
              orderBy: [{ externalEditionName: "asc" }],
              include: {
                source: {
                  select: {
                    code: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        },
        issueNumber: {
          select: {
            id: true,
            rawValue: true,
            canonicalValue: true,
          },
        },
        _count: {
          select: {
            lineItems: true,
          },
        },
        lineItems: {
          take: REGISTRY_OCCURRENCE_LIMIT,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            description: true,
            rawRowText: true,
            document: {
              select: {
                documentNumber: true,
                sourceFileName: true,
              },
            },
          },
        },
      },
    });

    const candidateCounts = await getExactCandidateCounts(
      items.map((item) => ({
        publicationIssueId: item.id,
        publicationName: item.publication.displayName,
        canonicalIssueNumber: item.issueNumber.canonicalValue,
      })),
    );
    const confirmedMatchCounts = await getConfirmedDocumentMatchCounts({
      documentId,
      publicationIssueIds: items.map((item) => item.id),
    });
    const savedDocumentIssueMatches = await getSavedDocumentIssueMatches({
      documentId,
      publicationIssueIds: items.map((item) => item.id),
    });

    const registryItems = items.map((item) => {
      const counts = candidateCounts.get(item.id) ?? {
        publicationCandidateCount: 0,
        issueNumberCandidateCount: 0,
      };
      const hasConfirmedDocumentMatch = (confirmedMatchCounts.get(item.id) ?? 0) > 0;

      const fullyMatched =
        item.publication.mappings.length > 0 &&
        counts.issueNumberCandidateCount > 0 &&
        hasConfirmedDocumentMatch;

      return {
        ...mapSummary(item),
        ...counts,
        fullyMatched,
        hasConfirmedDocumentMatch,
        documentOccurrences: mapDocumentOccurrences(item.lineItems),
        documentOccurrenceCount: item._count.lineItems,
        hasMultipleDocumentIssueMatches:
          (savedDocumentIssueMatches.detailMap.get(item.id)?.length ?? 0) > 1,
        documentIssueMatchCount: savedDocumentIssueMatches.detailMap.get(item.id)?.length ?? 0,
        savedDocumentIssueMatch: savedDocumentIssueMatches.summaryMap.get(item.id) ?? null,
        savedDocumentIssueMatchDetails: savedDocumentIssueMatches.detailMap.get(item.id) ?? [],
      };
    });

    if (filter === "matched") {
      return registryItems.filter((item) => item.fullyMatched);
    }

    if (filter === "unmatched" || filter === "document-unmatched") {
      return registryItems.filter((item) => !item.fullyMatched);
    }

    return registryItems;
  },
);
