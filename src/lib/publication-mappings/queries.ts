import { cache } from "react";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getExactCandidateCounts } from "@/lib/publication-mappings/service";
import type {
  PublicationIssueMatchSummary,
  PublicationIssueRegistryFilter,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

const buildRegistryWhere = (
  filter: PublicationIssueRegistryFilter,
): Prisma.PublicationIssueWhereInput => {
  if (filter === "matched") {
    return {
      publication: { is: { mappings: { some: {} } } },
      issueNumber: { is: { mappings: { some: {} } } },
    };
  }

  if (filter === "unmatched") {
    return {
      OR: [
        { publication: { is: { mappings: { none: {} } } } },
        { issueNumber: { is: { mappings: { none: {} } } } },
      ],
    };
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
    canonicalValue: string;
    mappings: Array<{
      id: number;
      externalIssueId: number;
      externalIssueNumber: string;
      source: { code: string; displayName: string };
    }>;
  };
}): PublicationIssueMatchSummary => ({
  publicationIssueId: publicationIssue.id,
  publicationId: publicationIssue.publication.id,
  issueNumberId: publicationIssue.issueNumber.id,
  publicationName: publicationIssue.publication.displayName,
  canonicalIssueNumber: publicationIssue.issueNumber.canonicalValue,
  publicationMappingCount: publicationIssue.publication.mappings.length,
  issueNumberMappingCount: publicationIssue.issueNumber.mappings.length,
  publicationCandidateCount: 0,
  issueNumberCandidateCount: 0,
  fullyMatched:
    publicationIssue.publication.mappings.length > 0 &&
    publicationIssue.issueNumber.mappings.length > 0,
  publicationMappings: publicationIssue.publication.mappings.map((mapping) => ({
    id: mapping.id,
    sourceCode: mapping.source.code,
    sourceDisplayName: mapping.source.displayName,
    externalEditionId: mapping.externalEditionId,
    externalEditionName: mapping.externalEditionName,
  })),
  issueNumberMappings: publicationIssue.issueNumber.mappings.map((mapping) => ({
    id: mapping.id,
    sourceCode: mapping.source.code,
    sourceDisplayName: mapping.source.displayName,
    externalIssueId: mapping.externalIssueId,
    externalIssueNumber: mapping.externalIssueNumber,
  })),
});

export const getPublicationIssueRegistry = cache(
  async (filter: PublicationIssueRegistryFilter): Promise<PublicationIssueRegistryItem[]> => {
    const items = await prisma.publicationIssue.findMany({
      where: buildRegistryWhere(filter),
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
            canonicalValue: true,
            mappings: {
              orderBy: [{ externalIssueNumber: "asc" }],
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
        lineItems: {
          take: 5,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: {
            description: true,
            document: {
              select: {
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

    return items.map((item) => {
      const counts = candidateCounts.get(item.id) ?? {
        publicationCandidateCount: 0,
        issueNumberCandidateCount: 0,
      };

      return {
        ...mapSummary(item),
        ...counts,
        sampleDescriptions: Array.from(
          new Set(item.lineItems.map((lineItem) => lineItem.description)),
        ),
        documentLabels: Array.from(
          new Set(item.lineItems.map((lineItem) => lineItem.document.sourceFileName)),
        ),
      };
    });
  },
);
