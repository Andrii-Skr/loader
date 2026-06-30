import { cache } from "react";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getExactCandidateCounts } from "@/lib/publication-mappings/service";
import type {
  PublicationIssueDocumentOccurrence,
  PublicationIssueMatchSummary,
  PublicationIssueRegistryFilter,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

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
