import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getExternalEditionSchema,
  getExternalEditionSourceCode,
  getExternalEditionSourceName,
} from "@/lib/publication-mappings/config";
import {
  getExactExternalEditionCounts,
  getExactExternalIssueNumberCounts,
  getExternalEditionsByIds,
  searchExternalEditions,
  searchExternalIssueNumbersByEdition,
} from "@/lib/publication-mappings/external-repository";
import {
  normalizeIssueLookupText,
  normalizeMatchingText,
  scoreIssueSimilarity,
  scoreTextSimilarity,
} from "@/lib/publication-mappings/matching";
import type {
  IssueNumberCandidateDto,
  PublicationCandidateDto,
  PublicationMappingDto,
} from "@/lib/publication-mappings/types";

type LocalPublicationIssueLookup = {
  id: number;
  publication: {
    id: number;
    displayName: string;
  };
  issueNumber: {
    id: number;
    canonicalValue: string;
  };
};

const scoreIssueNumberFormatQuality = (value: string): number => {
  let score = 0;

  if (/\/{2,}/u.test(value) || /-{2,}/u.test(value)) {
    score -= 1;
  }

  return score;
};

const mapPublicationMapping = (mapping: {
  id: number;
  source: { code: string; displayName: string };
  externalEditionId: number;
  externalEditionName: string;
}): PublicationMappingDto => ({
  id: mapping.id,
  sourceCode: mapping.source.code,
  sourceDisplayName: mapping.source.displayName,
  externalEditionId: mapping.externalEditionId,
  externalEditionName: mapping.externalEditionName,
});

const getPublicationIssueForMatching = async (
  publicationIssueId: number,
): Promise<LocalPublicationIssueLookup | null> =>
  prisma.publicationIssue.findUnique({
    where: { id: publicationIssueId },
    select: {
      id: true,
      publication: {
        select: {
          id: true,
          displayName: true,
        },
      },
      issueNumber: {
        select: {
          id: true,
          canonicalValue: true,
        },
      },
    },
  });

export type PreparedPublicationMappingReplacement = {
  publicationId: number;
  externalEditions: Array<{
    externalEditionId: number;
    externalEditionName: string;
  }>;
};

export const preparePublicationMappingReplacement = async ({
  publicationId,
  selections,
}: {
  publicationId: number;
  selections: Array<{ externalEditionId: number }>;
}): Promise<PreparedPublicationMappingReplacement> => {
  const uniqueSelections = Array.from(
    new Map(selections.map((selection) => [selection.externalEditionId, selection])).values(),
  );
  const editionRows = await getExternalEditionsByIds(
    uniqueSelections.map((selection) => selection.externalEditionId),
  );
  const editionById = new Map(editionRows.map((edition) => [edition.id, edition]));

  return {
    publicationId,
    externalEditions: uniqueSelections.flatMap((selection) => {
      const edition = editionById.get(selection.externalEditionId);

      return edition
        ? [
            {
              externalEditionId: edition.id,
              externalEditionName: edition.name,
            },
          ]
        : [];
    }),
  };
};

export const applyPublicationMappingReplacements = async ({
  replacements,
  tx,
}: {
  replacements: PreparedPublicationMappingReplacement[];
  tx: Prisma.TransactionClient;
}) => {
  if (replacements.length === 0) {
    return;
  }

  const source = await tx.externalEditionSource.upsert({
    where: { code: getExternalEditionSourceCode() },
    update: {
      displayName: getExternalEditionSourceName(),
      schemaName: getExternalEditionSchema(),
    },
    create: {
      code: getExternalEditionSourceCode(),
      displayName: getExternalEditionSourceName(),
      schemaName: getExternalEditionSchema(),
    },
  });

  for (const replacement of replacements) {
    await tx.publicationMapping.deleteMany({
      where: {
        publicationId: replacement.publicationId,
        sourceId: source.id,
      },
    });

    if (replacement.externalEditions.length > 0) {
      await tx.publicationMapping.createMany({
        data: replacement.externalEditions.map((edition) => ({
          publicationId: replacement.publicationId,
          sourceId: source.id,
          ...edition,
        })),
      });
    }
  }
};

export const getPublicationMappings = async (publicationId: number) => {
  const mappings = await prisma.publicationMapping.findMany({
    where: { publicationId },
    orderBy: [{ externalEditionName: "asc" }],
    include: {
      source: {
        select: {
          code: true,
          displayName: true,
        },
      },
    },
  });

  return mappings.map(mapPublicationMapping);
};

export const searchPublicationCandidates = async ({
  publicationIssueId,
  query,
}: {
  publicationIssueId: number;
  query?: string;
}): Promise<PublicationCandidateDto[]> => {
  const publicationIssue = await getPublicationIssueForMatching(publicationIssueId);

  if (!publicationIssue) {
    return [];
  }

  const editions = await searchExternalEditions(
    query?.trim() || publicationIssue.publication.displayName,
  );

  return editions
    .map((edition) => ({
      externalEditionId: edition.id,
      externalEditionName: edition.name,
      isExactMatch:
        normalizeMatchingText(publicationIssue.publication.displayName) ===
        normalizeMatchingText(edition.name),
      score: Number(
        scoreTextSimilarity(publicationIssue.publication.displayName, edition.name).toFixed(6),
      ),
    }))
    .sort(
      (left, right) =>
        Number(right.isExactMatch) - Number(left.isExactMatch) ||
        right.score - left.score ||
        left.externalEditionName.localeCompare(right.externalEditionName, "uk-UA"),
    )
    .slice(0, 40);
};

export const searchIssueNumberCandidates = async ({
  publicationIssueId,
  externalEditionId,
  query,
}: {
  publicationIssueId: number;
  externalEditionId?: number;
  query?: string;
}): Promise<IssueNumberCandidateDto[]> => {
  if (!externalEditionId) {
    return [];
  }

  const publicationIssue = await getPublicationIssueForMatching(publicationIssueId);

  if (!publicationIssue) {
    return [];
  }

  const targetIssueNumber = query?.trim() || publicationIssue.issueNumber.canonicalValue;
  const issues = await searchExternalIssueNumbersByEdition({
    externalEditionId,
    query: targetIssueNumber,
  });
  const normalizedTarget = normalizeIssueLookupText(targetIssueNumber);
  const isManualSearch = Boolean(query?.trim());
  const compactTarget = normalizedTarget.replace(/\s+/gu, "");

  return issues
    .filter((issue) => {
      if (!isManualSearch) {
        return true;
      }

      const normalizedCandidate = normalizeIssueLookupText(issue.number);

      return (
        normalizedCandidate.includes(normalizedTarget) ||
        normalizedCandidate.replace(/\s+/gu, "").includes(compactTarget)
      );
    })
    .map((issue) => {
      const normalizedCandidate = normalizeIssueLookupText(issue.number);
      const isExactMatch =
        normalizedTarget === normalizedCandidate ||
        targetIssueNumber.trim().toLocaleLowerCase("uk-UA") ===
          issue.number.trim().toLocaleLowerCase("uk-UA");

      return {
        externalIssueId: issue.id,
        externalIssueNumber: issue.number,
        isExactMatch,
        formatQuality: scoreIssueNumberFormatQuality(issue.number),
        score: Number(
          Math.max(
            scoreTextSimilarity(normalizedTarget, normalizedCandidate),
            scoreIssueSimilarity(targetIssueNumber, issue.number),
          ).toFixed(6),
        ),
      };
    })
    .sort(
      (left, right) =>
        Number(right.isExactMatch) - Number(left.isExactMatch) ||
        right.score - left.score ||
        right.formatQuality - left.formatQuality ||
        right.externalIssueId - left.externalIssueId ||
        left.externalIssueNumber.localeCompare(right.externalIssueNumber, "uk-UA"),
    )
    .slice(0, 40);
};

export const replacePublicationMappings = async ({
  publicationId,
  selections,
}: {
  publicationId: number;
  selections: Array<{ externalEditionId: number }>;
}) => {
  const replacement = await preparePublicationMappingReplacement({ publicationId, selections });

  await prisma.$transaction(async (tx) => {
    await applyPublicationMappingReplacements({ replacements: [replacement], tx });
  });

  return getPublicationMappings(publicationId);
};

export const getExactCandidateCounts = async (
  items: Array<{
    publicationIssueId: number;
    publicationName: string;
    canonicalIssueNumber: string;
  }>,
) => {
  const normalizedPublicationNames = Array.from(
    new Set(items.map((item) => item.publicationName.trim().toLocaleLowerCase("uk-UA"))),
  );
  const normalizedIssueNumbers = Array.from(
    new Set(items.map((item) => item.canonicalIssueNumber.trim().toLocaleLowerCase("uk-UA"))),
  );

  const [publicationCounts, issueNumberCounts] = await Promise.all([
    getExactExternalEditionCounts(normalizedPublicationNames),
    getExactExternalIssueNumberCounts(normalizedIssueNumbers),
  ]);

  return new Map<
    number,
    {
      publicationCandidateCount: number;
      issueNumberCandidateCount: number;
    }
  >(
    items.map((item) => [
      item.publicationIssueId,
      {
        publicationCandidateCount:
          publicationCounts.get(item.publicationName.trim().toLocaleLowerCase("uk-UA")) ?? 0,
        issueNumberCandidateCount:
          issueNumberCounts.get(item.canonicalIssueNumber.trim().toLocaleLowerCase("uk-UA")) ?? 0,
      },
    ]),
  );
};
