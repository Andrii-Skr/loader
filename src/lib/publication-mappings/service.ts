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
  getExternalIssueNumbersByIds,
  searchExternalEditions,
  searchExternalIssueNumbers,
} from "@/lib/publication-mappings/external-repository";
import {
  normalizeIssueLookupText,
  normalizeMatchingText,
  scoreIssueSimilarity,
  scoreTextSimilarity,
} from "@/lib/publication-mappings/matching";
import type {
  IssueNumberCandidateDto,
  IssueNumberMappingDto,
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

const mapIssueNumberMapping = (mapping: {
  id: number;
  source: { code: string; displayName: string };
  externalIssueId: number;
  externalIssueNumber: string;
}): IssueNumberMappingDto => ({
  id: mapping.id,
  sourceCode: mapping.source.code,
  sourceDisplayName: mapping.source.displayName,
  externalIssueId: mapping.externalIssueId,
  externalIssueNumber: mapping.externalIssueNumber,
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

const ensureExternalEditionSource = async () =>
  prisma.externalEditionSource.upsert({
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

export const getIssueNumberMappings = async (issueNumberId: number) => {
  const mappings = await prisma.issueNumberMapping.findMany({
    where: { issueNumberId },
    orderBy: [{ externalIssueNumber: "asc" }],
    include: {
      source: {
        select: {
          code: true,
          displayName: true,
        },
      },
    },
  });

  return mappings.map(mapIssueNumberMapping);
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
  query,
}: {
  publicationIssueId: number;
  query?: string;
}): Promise<IssueNumberCandidateDto[]> => {
  const publicationIssue = await getPublicationIssueForMatching(publicationIssueId);

  if (!publicationIssue) {
    return [];
  }

  const issueQuery = query?.trim() || publicationIssue.issueNumber.canonicalValue;
  const issues = await searchExternalIssueNumbers(issueQuery);
  const normalizedTarget = normalizeIssueLookupText(publicationIssue.issueNumber.canonicalValue);

  return issues
    .map((issue) => {
      const normalizedCandidate = normalizeIssueLookupText(issue.number);
      const isExactMatch =
        normalizedTarget === normalizedCandidate ||
        publicationIssue.issueNumber.canonicalValue.trim().toLocaleLowerCase("uk-UA") ===
          issue.number.trim().toLocaleLowerCase("uk-UA");

      return {
        externalIssueId: issue.id,
        externalIssueNumber: issue.number,
        isExactMatch,
        score: Number(
          Math.max(
            scoreTextSimilarity(normalizedTarget, normalizedCandidate),
            scoreIssueSimilarity(publicationIssue.issueNumber.canonicalValue, issue.number),
          ).toFixed(6),
        ),
      };
    })
    .sort(
      (left, right) =>
        Number(right.isExactMatch) - Number(left.isExactMatch) ||
        right.score - left.score ||
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
  const source = await ensureExternalEditionSource();

  if (selections.length === 0) {
    await prisma.publicationMapping.deleteMany({
      where: {
        publicationId,
        sourceId: source.id,
      },
    });

    return [];
  }

  const uniqueSelections = Array.from(
    new Map(selections.map((selection) => [selection.externalEditionId, selection])).values(),
  );
  const editionRows = await getExternalEditionsByIds(
    uniqueSelections.map((selection) => selection.externalEditionId),
  );
  const editionById = new Map(editionRows.map((edition) => [edition.id, edition]));

  const payload = uniqueSelections.flatMap((selection) => {
    const edition = editionById.get(selection.externalEditionId);

    if (!edition) {
      return [];
    }

    return [
      {
        publicationId,
        sourceId: source.id,
        externalEditionId: edition.id,
        externalEditionName: edition.name,
      },
    ];
  });

  await prisma.$transaction(async (tx) => {
    await tx.publicationMapping.deleteMany({
      where: {
        publicationId,
        sourceId: source.id,
      },
    });

    if (payload.length > 0) {
      await tx.publicationMapping.createMany({
        data: payload,
      });
    }
  });

  return getPublicationMappings(publicationId);
};

export const replaceIssueNumberMappings = async ({
  issueNumberId,
  selections,
}: {
  issueNumberId: number;
  selections: Array<{ externalIssueId: number }>;
}) => {
  const source = await ensureExternalEditionSource();

  if (selections.length === 0) {
    await prisma.issueNumberMapping.deleteMany({
      where: {
        issueNumberId,
        sourceId: source.id,
      },
    });

    return [];
  }

  const uniqueSelections = Array.from(
    new Map(selections.map((selection) => [selection.externalIssueId, selection])).values(),
  );
  const issueRows = await getExternalIssueNumbersByIds(
    uniqueSelections.map((selection) => selection.externalIssueId),
  );
  const issueById = new Map(issueRows.map((issue) => [issue.id, issue]));

  const payload = uniqueSelections.flatMap((selection) => {
    const issue = issueById.get(selection.externalIssueId);

    if (!issue) {
      return [];
    }

    return [
      {
        issueNumberId,
        sourceId: source.id,
        externalIssueId: issue.id,
        externalIssueNumber: issue.number,
      },
    ];
  });

  await prisma.$transaction(async (tx) => {
    await tx.issueNumberMapping.deleteMany({
      where: {
        issueNumberId,
        sourceId: source.id,
      },
    });

    if (payload.length > 0) {
      await tx.issueNumberMapping.createMany({
        data: payload,
      });
    }
  });

  return getIssueNumberMappings(issueNumberId);
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
