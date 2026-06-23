import type { MappingStatusKey } from "@/lib/documents/mapping-status";

export type RegistryDocumentInput<TDocument> = TDocument & {
  documentDate: Date | null;
  mappingStatus: MappingStatusKey;
};

type RegistryDocumentOutput<TDocument> = Omit<TDocument, "documentDate">;

export type RegistryDocumentGroup<TDocument> = {
  key: string;
  title: string;
  count: number;
  documents: TDocument[];
};

const getMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const formatRegistryMonthLabel = (locale: string, date: Date) =>
  new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .formatToParts(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
    .filter((part) => part.type === "month" || part.type === "year")
    .map((part) => part.value.trim())
    .filter(Boolean)
    .join(" ");

export function splitRegistryDocuments<TDocument extends Record<string, unknown>>({
  documents,
  locale,
  undatedTitle,
}: {
  documents: Array<RegistryDocumentInput<TDocument>>;
  locale: string;
  undatedTitle: string;
}) {
  const actionableDocuments: Array<RegistryDocumentOutput<RegistryDocumentInput<TDocument>>> = [];
  const completedDocuments: Array<RegistryDocumentInput<TDocument>> = [];

  for (const document of documents) {
    if (document.mappingStatus === "fullyMatched") {
      completedDocuments.push(document);
      continue;
    }

    const { documentDate: _documentDate, ...actionableDocument } = document;
    actionableDocuments.push(actionableDocument);
  }

  const monthGroups = new Map<
    string,
    {
      key: string;
      title: string;
      sortValue: number;
      documents: Array<RegistryDocumentOutput<RegistryDocumentInput<TDocument>>>;
    }
  >();
  const undatedDocuments: Array<RegistryDocumentOutput<RegistryDocumentInput<TDocument>>> = [];

  for (const document of completedDocuments) {
    const { documentDate, ...completedDocument } = document;

    if (!documentDate) {
      undatedDocuments.push(completedDocument);
      continue;
    }

    const monthKey = getMonthKey(documentDate);
    const existingGroup = monthGroups.get(monthKey);

    if (existingGroup) {
      existingGroup.documents.push(completedDocument);
      continue;
    }

    monthGroups.set(monthKey, {
      key: monthKey,
      title: formatRegistryMonthLabel(locale, documentDate),
      sortValue: Date.UTC(documentDate.getUTCFullYear(), documentDate.getUTCMonth(), 1),
      documents: [completedDocument],
    });
  }

  const completedGroups: Array<
    RegistryDocumentGroup<RegistryDocumentOutput<RegistryDocumentInput<TDocument>>>
  > = [...monthGroups.values()]
    .sort((left, right) => right.sortValue - left.sortValue)
    .map(({ key, title, documents: groupedDocuments }) => ({
      key,
      title,
      count: groupedDocuments.length,
      documents: groupedDocuments,
    }));

  if (undatedDocuments.length > 0) {
    completedGroups.push({
      key: "undated",
      title: undatedTitle,
      count: undatedDocuments.length,
      documents: undatedDocuments,
    });
  }

  return {
    actionableDocuments,
    completedGroups,
  };
}
