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

export type RegistryMonetaryDocument = {
  totalAmountRaw: string | null;
  currency: string;
};

export type RegistryMoneyTotal = {
  currency: string;
  amountMinor: bigint;
};

const MONEY_AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

const toMoneyMinorUnits = (amount: string) => {
  const match = MONEY_AMOUNT_PATTERN.exec(amount);

  if (!match) {
    return null;
  }

  const [, sign, whole, decimal = ""] = match;
  const minor = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));

  return sign === "-" ? -minor : minor;
};

export const calculateRegistryMoneyTotals = (
  documents: readonly RegistryMonetaryDocument[],
): RegistryMoneyTotal[] => {
  const totals = new Map<string, bigint>();

  for (const document of documents) {
    if (document.totalAmountRaw === null) {
      continue;
    }

    const amountMinor = toMoneyMinorUnits(document.totalAmountRaw);

    if (amountMinor === null) {
      continue;
    }

    totals.set(document.currency, (totals.get(document.currency) ?? 0n) + amountMinor);
  }

  return [...totals.entries()]
    .sort(([leftCurrency], [rightCurrency]) => leftCurrency.localeCompare(rightCurrency))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }));
};

const formatMoneyMinorUnits = (locale: string, currency: string, amountMinor: bigint) => {
  const isNegative = amountMinor < 0n;
  const absoluteAmount = isNegative ? -amountMinor : amountMinor;
  const whole = absoluteAmount / 100n;
  const fraction = (absoluteAmount % 100n).toString().padStart(2, "0");
  const isEnglish = locale.startsWith("en");
  const [groupSeparator, decimalSeparator] = isEnglish ? [",", "."] : ["\u00a0", ","];
  const formattedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator);
  const currencyLabel = currency === "UAH" ? "₴" : currency === "RUB" ? "₽" : currency;

  return `${isNegative ? "-" : ""}${formattedWhole}${decimalSeparator}${fraction}\u00a0${currencyLabel}`;
};

export const formatRegistryMoneyTotals = ({
  documents,
  locale,
}: {
  documents: readonly RegistryMonetaryDocument[];
  locale: string;
}) =>
  calculateRegistryMoneyTotals(documents).map(({ currency, amountMinor }) =>
    formatMoneyMinorUnits(locale, currency, amountMinor),
  );

const getMonthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const getRegistryReconciliationPath = (monthKey: string) =>
  monthKey === "undated" ? null : `/dashboard/reconciliation/${monthKey}`;

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
