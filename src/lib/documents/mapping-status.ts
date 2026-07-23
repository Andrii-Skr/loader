export type MappingStatusKey = "unparsed" | "unmatched" | "partiallyMatched" | "fullyMatched";

type MappingCountCarrier = {
  publicationIssueConfirmedAt: Date | null;
  externalMatchCount?: number;
  externalMatches?: readonly unknown[];
  publicationIssue: {
    publication: { _count: { mappings: number } };
  } | null;
};

export function getLineItemMappingStatusKey(item: MappingCountCarrier): MappingStatusKey {
  if (
    ((item.externalMatchCount ?? 0) > 0 || (item.externalMatches?.length ?? 0) > 0) &&
    item.publicationIssueConfirmedAt
  ) {
    return "fullyMatched";
  }

  if (!item.publicationIssue) {
    return "unparsed";
  }

  const hasPublicationMappings = item.publicationIssue.publication._count.mappings > 0;

  if (!hasPublicationMappings) {
    return "unmatched";
  }

  return "partiallyMatched";
}

export function getDocumentMappingStatus(items: readonly MappingCountCarrier[]): MappingStatusKey {
  if (items.length === 0) {
    return "unparsed";
  }

  const statuses = items.map(getLineItemMappingStatusKey);

  if (statuses.every((status) => status === "unparsed")) {
    return "unparsed";
  }

  if (statuses.every((status) => status === "fullyMatched")) {
    return "fullyMatched";
  }

  if (statuses.some((status) => status === "unparsed")) {
    return "unparsed";
  }

  const hasMatchedProgress = statuses.some(
    (status) => status === "fullyMatched" || status === "partiallyMatched",
  );

  if (hasMatchedProgress) {
    return "partiallyMatched";
  }

  return "unmatched";
}
