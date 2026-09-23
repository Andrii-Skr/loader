"use client";

import {
  ArrowUpDown,
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  LoaderCircle,
  Minus,
  Plus,
} from "lucide-react";
import { Fragment, useDeferredValue, useState, useTransition } from "react";

import { DeleteDocumentButton } from "@/app/(app)/dashboard/DeleteDocumentButton";
import { selectInvoiceVersion } from "@/app/actions/documents";
import { MappingStatusIcon } from "@/components/documents/mapping-status-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { MappingStatusKey } from "@/lib/documents/mapping-status";
import { formatRegistryMoneyTotals, getRegistryReconciliationPath } from "@/lib/documents/registry";
import { cn } from "@/lib/utils";

type RegistryDocumentRow = {
  id: number;
  documentTypeId: number;
  documentTypeName: string;
  label: string;
  documentSearchValue: string;
  documentDateIso: string | null;
  supplierTaxId: string | null;
  supplierName: string | null;
  recipientName: string | null;
  totalAmount: string | null;
  totalAmountValue: number | null;
  totalAmountRaw: string | null;
  currency: string;
  mappingStatus: MappingStatusKey;
  lineItemsCount: number;
  hasTaxInvoice: boolean;
  versionHistory: Array<{
    id: number;
    sourceFileName: string;
    documentNumber: string;
    documentDate: string;
    supplierName: string;
    recipientName: string;
    totalAmount: string;
    revision: number;
    isCurrent: boolean;
  }>;
};

type RegistryMonthGroup = {
  key: string;
  title: string;
  count: number;
  documents: RegistryDocumentRow[];
};

type SearchKey = "document" | "amount" | "rows";
type SearchQueries = Record<SearchKey, string>;
type SortKey = "label" | "supplierName" | "recipientName" | "totalAmountValue";
type SortDirection = "ascending" | "descending";

const mappingStatusKeys = [
  "unparsed",
  "unmatched",
  "partiallyMatched",
  "fullyMatched",
] as const satisfies readonly MappingStatusKey[];

type DocumentRegistryProps = {
  locale: AppLocale;
  pendingLabel: string;
  emptyRegistryLabel: string;
  emptySearchLabel: string;
  searchPlaceholder: string;
  searchLabels: Record<SearchKey | "supplier" | "recipient", string>;
  dateRangeLabels: { title: string; from: string; to: string; clear: string };
  supplierFilterPlaceholder: string;
  recipientFilterPlaceholder: string;
  supplierNames: string[];
  recipientNames: string[];
  typeFilterLabel: string;
  typeFilterPlaceholder: string;
  documentTypes: Array<{ id: number; name: string }>;
  statusFilterLabel: string;
  statusFilterPlaceholder: string;
  sortLabels: {
    ascending: string;
    descending: string;
  };
  sortAlphabet: string;
  actionableSectionTitle: string;
  completedSectionTitle: string;
  completedMonthToggleLabel: string;
  canDeleteDocuments: boolean;
  reconciliationLabel: string;
  tableLabels: {
    document: string;
    type: string;
    supplier: string;
    recipient: string;
    amount: string;
    status: string;
    rows: string;
    taxInvoice: string;
    actions: string;
  };
  mappingStatusLabels: Record<MappingStatusKey, string>;
  versionHistoryLabels: {
    toggle: string;
    title: string;
    current: string;
    makeCurrent: string;
    selectionFailed: string;
    number: string;
    date: string;
    supplier: string;
    recipient: string;
  };
  actionableDocuments: RegistryDocumentRow[];
  completedGroups: RegistryMonthGroup[];
};

function SortDirectionArrow({ direction }: { direction: SortDirection }) {
  const isAscending = direction === "ascending";

  return (
    <svg
      aria-hidden="true"
      className="row-span-2 size-3.5 self-center"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {isAscending ? (
        <>
          <path d="m16 16-4 4-4-4" />
          <path d="M12 20V4" />
        </>
      ) : (
        <>
          <path d="m8 8 4-4 4 4" />
          <path d="M12 4v16" />
        </>
      )}
    </svg>
  );
}

function DocumentTypeFilter({
  documentTypes,
  label,
  onChange,
  placeholder,
  value,
}: {
  documentTypes: DocumentRegistryProps["documentTypes"];
  label: string;
  onChange: (value: number | null) => void;
  placeholder: string;
  value: number | null;
}) {
  const [open, setOpen] = useState(false);
  const selectedType = documentTypes.find((documentType) => documentType.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className="h-9 w-full min-w-0 justify-between rounded-xl px-3 text-xs"
          size="xs"
          type="button"
          variant="outline"
        >
          <span className={selectedType ? "truncate" : "muted truncate"}>
            {selectedType?.name ?? placeholder}
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[17rem] max-w-[calc(100vw-2rem)] p-1.5">
        <div className="grid">
          <Button
            className="justify-start px-3 text-xs"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {placeholder}
          </Button>
          {documentTypes.map((documentType) => (
            <Button
              key={documentType.id}
              className="justify-start px-3 text-xs"
              onClick={() => {
                onChange(documentType.id);
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {documentType.name}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PartyNameFilter({
  label,
  names,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  names: string[];
  onChange: (value: string | null) => void;
  placeholder: string;
  value: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className="h-9 w-full min-w-0 justify-between rounded-xl px-3 text-xs"
          size="xs"
          type="button"
          variant="outline"
        >
          <span className={value ? "truncate" : "muted truncate"}>{value ?? placeholder}</span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[17rem] max-w-[calc(100vw-2rem)] p-1.5">
        <div className="grid max-h-72 overflow-y-auto">
          <Button
            className="justify-start px-3 text-xs"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {placeholder}
          </Button>
          {names.map((name) => (
            <Button
              key={name}
              className="h-auto justify-start px-3 py-2 text-left text-xs whitespace-normal"
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {name}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableTableHead({
  children,
  sortDirection,
  sortKey,
  onSort,
  sortAlphabet,
  sortLabels,
}: {
  children: string;
  sortDirection: SortDirection | null;
  sortKey: SortKey;
  onSort: (sortKey: SortKey) => void;
  sortAlphabet: string;
  sortLabels: DocumentRegistryProps["sortLabels"];
}) {
  const nextSortLabel =
    sortDirection === "ascending" ? sortLabels.descending : sortLabels.ascending;
  const [alphabetStart, alphabetEnd] = sortAlphabet.split("–");
  const [topLetter, bottomLetter] =
    sortDirection === "ascending" ? [alphabetStart, alphabetEnd] : [alphabetEnd, alphabetStart];

  return (
    <TableHead aria-sort={sortDirection ?? "none"}>
      <Button
        aria-label={`${children}: ${nextSortLabel}`}
        className="-mx-2 -my-1 h-auto rounded-lg px-2 py-1 text-[0.8rem] font-semibold tracking-[0.08em] uppercase"
        onClick={() => onSort(sortKey)}
        size="xs"
        variant="ghost"
      >
        {children}
        {sortDirection ? (
          <span
            aria-hidden="true"
            className="inline-grid grid-cols-[0.875rem_auto] grid-rows-2 items-center gap-x-px text-[0.5rem] leading-[0.46rem] tracking-normal"
          >
            <SortDirectionArrow direction={sortDirection} />
            <span className="col-start-2">{topLetter}</span>
            <span className="col-start-2 row-start-2">{bottomLetter}</span>
          </span>
        ) : (
          <ArrowUpDown aria-hidden="true" className="size-3.5 text-[color:var(--ink-soft)]" />
        )}
      </Button>
    </TableHead>
  );
}

function RegistrySearchInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <Input
      aria-label={label}
      className="h-9 min-w-0 rounded-xl px-3 py-2 text-xs"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="search"
      value={value}
    />
  );
}

function DocumentDateRangeFilter({
  from,
  labels,
  onFromChange,
  onToChange,
  to,
}: {
  from: string;
  labels: DocumentRegistryProps["dateRangeLabels"];
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  to: string;
}) {
  const isActive = Boolean(from || to);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={labels.title}
          className="h-9 shrink-0 rounded-xl"
          size="icon-sm"
          title={labels.title}
          type="button"
          variant={isActive ? "secondary" : "outline"}
        >
          <CalendarRange aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="grid w-[17rem] max-w-[calc(100vw-2rem)] gap-3 p-3">
        <strong className="text-sm">{labels.title}</strong>
        <label className="grid gap-1 text-xs">
          <span>{labels.from}</span>
          <Input
            className="h-9 rounded-xl px-3 text-xs"
            max={to || undefined}
            onChange={(event) => onFromChange(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span>{labels.to}</span>
          <Input
            className="h-9 rounded-xl px-3 text-xs"
            min={from || undefined}
            onChange={(event) => onToChange(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        {isActive ? (
          <Button
            className="justify-self-start"
            onClick={() => {
              onFromChange("");
              onToChange("");
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {labels.clear}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function StatusFilter({
  label,
  mappingStatusLabels,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  mappingStatusLabels: Record<MappingStatusKey, string>;
  onChange: (value: MappingStatusKey | null) => void;
  placeholder: string;
  value: MappingStatusKey | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={label}
          className="h-9 w-full min-w-0 justify-between rounded-xl px-3 text-xs"
          size="xs"
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {value ? <MappingStatusIcon label={mappingStatusLabels[value]} status={value} /> : null}
            <span className={value ? "truncate" : "muted truncate"}>
              {value ? mappingStatusLabels[value] : placeholder}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[17rem] max-w-[calc(100vw-2rem)] p-1.5">
        <div className="grid">
          <Button
            className="justify-start px-3 text-xs"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {placeholder}
          </Button>
          {mappingStatusKeys.map((status) => (
            <Button
              key={status}
              className="justify-start px-3 text-xs"
              onClick={() => {
                onChange(status);
                setOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <MappingStatusIcon label={mappingStatusLabels[status]} status={status} />
              {mappingStatusLabels[status]}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RegistryDocumentTableRow({
  canDeleteDocuments,
  document,
  locale,
  pendingLabel,
  mappingStatusLabels,
  versionHistoryLabels,
}: {
  canDeleteDocuments: boolean;
  document: RegistryDocumentRow;
  locale: AppLocale;
  pendingLabel: string;
  mappingStatusLabels: Record<MappingStatusKey, string>;
  versionHistoryLabels: DocumentRegistryProps["versionHistoryLabels"];
}) {
  const router = useRouter();
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isVersionSelectionPending, startVersionSelectionTransition] = useTransition();
  const [versionSelectionError, setVersionSelectionError] = useState<string | null>(null);
  const href = `/dashboard/documents/${document.id}`;
  const rowCellClassName = "transition-colors group-hover:bg-[rgba(177,74,47,0.08)]";
  const rowLinkClassName =
    "block -mx-2 -my-[14px] px-2 py-[14px] min-[1400px]:-mx-4 min-[1400px]:px-4 focus-visible:bg-[rgba(177,74,47,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-inset";
  const hasVersionHistory = document.versionHistory.length > 1;

  const selectVersion = (documentId: number) => {
    startVersionSelectionTransition(async () => {
      const result = await selectInvoiceVersion({ documentId, locale });

      if (result.errorKey) {
        setVersionSelectionError(versionHistoryLabels.selectionFailed);
        return;
      }

      setVersionSelectionError(null);
      router.refresh();
    });
  };

  return (
    <Fragment>
      <TableRow className="group">
        <TableCell className={rowCellClassName}>
          <div className="flex items-start gap-1">
            <Link className={`${rowLinkClassName} min-w-0 flex-1`} href={href} locale={locale}>
              <strong>{document.label}</strong>
              <div className="muted">{document.supplierTaxId ?? pendingLabel}</div>
            </Link>
            {hasVersionHistory ? (
              <Button
                aria-expanded={isVersionHistoryOpen}
                aria-label={versionHistoryLabels.toggle}
                className="mt-1 shrink-0"
                onClick={() => setIsVersionHistoryOpen((open) => !open)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                {isVersionHistoryOpen ? <Minus /> : <Plus />}
              </Button>
            ) : null}
          </div>
        </TableCell>
        <TableCell className={rowCellClassName}>
          <Link className={rowLinkClassName} href={href} locale={locale}>
            {document.documentTypeName}
          </Link>
        </TableCell>
        <TableCell className={rowCellClassName}>
          <Link className={rowLinkClassName} href={href} locale={locale}>
            {document.supplierName ?? pendingLabel}
          </Link>
        </TableCell>
        <TableCell className={rowCellClassName}>
          <Link className={rowLinkClassName} href={href} locale={locale}>
            {document.recipientName ?? pendingLabel}
          </Link>
        </TableCell>
        <TableCell className={rowCellClassName}>
          <Link className={rowLinkClassName} href={href} locale={locale}>
            {document.totalAmount ?? pendingLabel}
          </Link>
        </TableCell>
        <TableCell className={rowCellClassName}>
          <MappingStatusIcon
            label={mappingStatusLabels[document.mappingStatus]}
            status={document.mappingStatus}
          />
        </TableCell>
        <TableCell className={rowCellClassName}>{document.lineItemsCount}</TableCell>
        <TableCell className={rowCellClassName}>{document.hasTaxInvoice ? "✓" : "—"}</TableCell>
        <TableCell className={cn(rowCellClassName)} data-row-action>
          {canDeleteDocuments ? (
            <DeleteDocumentButton documentId={document.id} locale={locale} />
          ) : null}
        </TableCell>
      </TableRow>
      {hasVersionHistory && isVersionHistoryOpen ? (
        <TableRow className="bg-[color:var(--panel-strong)]">
          <TableCell colSpan={9}>
            <div className="grid gap-3 p-1">
              <strong className="text-sm">{versionHistoryLabels.title}</strong>
              <div className="grid gap-2 lg:grid-cols-2">
                {document.versionHistory.map((version) => (
                  <section
                    className="grid gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] p-3 text-sm"
                    key={version.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate">{version.sourceFileName}</strong>
                      {version.isCurrent ? (
                        <span className="shrink-0 text-xs font-semibold text-[color:var(--success)]">
                          {versionHistoryLabels.current}
                        </span>
                      ) : null}
                    </div>
                    <span className="muted">
                      {versionHistoryLabels.number.replace("{value}", version.documentNumber)}
                    </span>
                    <span className="muted">
                      {versionHistoryLabels.date.replace("{value}", version.documentDate)}
                    </span>
                    <span className="muted">
                      {versionHistoryLabels.supplier.replace("{value}", version.supplierName)}
                    </span>
                    <span className="muted">
                      {versionHistoryLabels.recipient.replace("{value}", version.recipientName)}
                    </span>
                    <span className="font-semibold tabular-nums">{version.totalAmount}</span>
                    {!version.isCurrent ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          disabled={isVersionSelectionPending}
                          onClick={() => selectVersion(version.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {isVersionSelectionPending ? (
                            <LoaderCircle className="animate-spin" />
                          ) : null}
                          {versionHistoryLabels.makeCurrent}
                        </Button>
                        {canDeleteDocuments ? (
                          <DeleteDocumentButton documentId={version.id} locale={locale} />
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
              {versionSelectionError ? (
                <p className="text-sm text-[color:var(--destructive)]">{versionSelectionError}</p>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  );
}

function RegistrySectionRow({
  title,
  colSpan,
  total,
}: {
  title: string;
  colSpan: number;
  total?: string;
}) {
  if (total) {
    return (
      <TableRow className="bg-[color:var(--panel-strong)]">
        <TableCell className="py-3 text-xs font-semibold tracking-[0.08em] uppercase" colSpan={4}>
          {title}
        </TableCell>
        <TableCell className="whitespace-nowrap py-3 text-sm font-semibold normal-case tracking-normal tabular-nums">
          {total}
        </TableCell>
        <TableCell colSpan={colSpan - 5} />
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-[color:var(--panel-strong)]">
      <TableCell
        className="py-3 text-xs font-semibold tracking-[0.08em] uppercase"
        colSpan={colSpan}
      >
        {title}
      </TableCell>
    </TableRow>
  );
}

export function DocumentRegistry({
  locale,
  pendingLabel,
  emptyRegistryLabel,
  emptySearchLabel,
  searchPlaceholder,
  searchLabels,
  dateRangeLabels,
  supplierFilterPlaceholder,
  recipientFilterPlaceholder,
  supplierNames,
  recipientNames,
  typeFilterLabel,
  typeFilterPlaceholder,
  documentTypes,
  statusFilterLabel,
  statusFilterPlaceholder,
  sortAlphabet,
  sortLabels,
  actionableSectionTitle,
  completedSectionTitle,
  completedMonthToggleLabel,
  canDeleteDocuments,
  reconciliationLabel,
  tableLabels,
  mappingStatusLabels,
  versionHistoryLabels,
  actionableDocuments,
  completedGroups,
}: DocumentRegistryProps) {
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<SearchQueries>({
    document: "",
    amount: "",
    rows: "",
  });
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [documentDateFrom, setDocumentDateFrom] = useState("");
  const [documentDateTo, setDocumentDateTo] = useState("");
  const [recipientFilter, setRecipientFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<MappingStatusKey | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("ascending");
  const deferredSearchQueries = useDeferredValue(searchQueries);
  const normalizedSearchQueries: SearchQueries = {
    document: deferredSearchQueries.document.trim().toLocaleLowerCase(locale),
    amount: deferredSearchQueries.amount.trim().toLocaleLowerCase(locale),
    rows: deferredSearchQueries.rows.trim().toLocaleLowerCase(locale),
  };
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });

  const matchesSearch = (document: RegistryDocumentRow) =>
    (!normalizedSearchQueries.document ||
      document.documentSearchValue
        .toLocaleLowerCase(locale)
        .includes(normalizedSearchQueries.document)) &&
    (!documentDateFrom ||
      (document.documentDateIso !== null && document.documentDateIso >= documentDateFrom)) &&
    (!documentDateTo ||
      (document.documentDateIso !== null && document.documentDateIso <= documentDateTo)) &&
    (!typeFilter || document.documentTypeId === typeFilter) &&
    (!supplierFilter || document.supplierName === supplierFilter) &&
    (!recipientFilter || document.recipientName === recipientFilter) &&
    (!normalizedSearchQueries.amount ||
      document.totalAmount?.toLocaleLowerCase(locale).includes(normalizedSearchQueries.amount)) &&
    (!statusFilter || document.mappingStatus === statusFilter) &&
    (!normalizedSearchQueries.rows ||
      String(document.lineItemsCount)
        .toLocaleLowerCase(locale)
        .includes(normalizedSearchQueries.rows));

  const sortDocuments = (documents: RegistryDocumentRow[]) => {
    if (!sortKey) {
      return documents;
    }

    return [...documents].sort((left, right) => {
      if (sortKey === "totalAmountValue") {
        if (left.totalAmountValue === null) {
          return right.totalAmountValue === null ? 0 : 1;
        }

        if (right.totalAmountValue === null) {
          return -1;
        }

        const result = left.totalAmountValue - right.totalAmountValue;
        return sortDirection === "ascending" ? result : -result;
      }

      const result = collator.compare(left[sortKey] ?? "", right[sortKey] ?? "");
      return sortDirection === "ascending" ? result : -result;
    });
  };

  const filteredActionableDocuments = sortDocuments(actionableDocuments.filter(matchesSearch));
  const filteredCompletedGroups = completedGroups.flatMap((group) => {
    const documents = sortDocuments(group.documents.filter(matchesSearch));
    const total = formatRegistryMoneyTotals({ documents, locale });

    return documents.length > 0 ? [{ ...group, count: documents.length, documents, total }] : [];
  });
  const unallocatedTotal = formatRegistryMoneyTotals({
    documents: filteredActionableDocuments,
    locale,
  });
  const hasDocuments = filteredActionableDocuments.length > 0 || filteredCompletedGroups.length > 0;
  const hasActiveSearch =
    typeFilter !== null ||
    statusFilter !== null ||
    supplierFilter !== null ||
    recipientFilter !== null ||
    Boolean(documentDateFrom || documentDateTo) ||
    Object.values(searchQueries).some((query) => Boolean(query.trim()));

  const handleSearchChange = (key: SearchKey, value: string) => {
    setSearchQueries((queries) => ({ ...queries, [key]: value }));
  };

  const handleSort = (nextSortKey: SortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection((direction) => (direction === "ascending" ? "descending" : "ascending"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("ascending");
  };

  return (
    <TableShell>
      <Table className="registry-table">
        <TableHeader>
          <TableRow>
            <SortableTableHead
              onSort={handleSort}
              sortDirection={sortKey === "label" ? sortDirection : null}
              sortKey="label"
              sortAlphabet={sortAlphabet}
              sortLabels={sortLabels}
            >
              {tableLabels.document}
            </SortableTableHead>
            <TableHead>{tableLabels.type}</TableHead>
            <SortableTableHead
              onSort={handleSort}
              sortDirection={sortKey === "supplierName" ? sortDirection : null}
              sortKey="supplierName"
              sortAlphabet={sortAlphabet}
              sortLabels={sortLabels}
            >
              {tableLabels.supplier}
            </SortableTableHead>
            <SortableTableHead
              onSort={handleSort}
              sortDirection={sortKey === "recipientName" ? sortDirection : null}
              sortKey="recipientName"
              sortAlphabet={sortAlphabet}
              sortLabels={sortLabels}
            >
              {tableLabels.recipient}
            </SortableTableHead>
            <SortableTableHead
              onSort={handleSort}
              sortDirection={sortKey === "totalAmountValue" ? sortDirection : null}
              sortKey="totalAmountValue"
              sortAlphabet={sortAlphabet}
              sortLabels={sortLabels}
            >
              {tableLabels.amount}
            </SortableTableHead>
            <TableHead>{tableLabels.status}</TableHead>
            <TableHead>{tableLabels.rows}</TableHead>
            <TableHead>{tableLabels.taxInvoice}</TableHead>
            <TableHead>{tableLabels.actions}</TableHead>
          </TableRow>
          <TableRow className="bg-[color:var(--panel-strong)]">
            <TableHead className="p-2 normal-case tracking-normal">
              <div className="flex items-center gap-1">
                <RegistrySearchInput
                  label={searchLabels.document}
                  onChange={(value) => handleSearchChange("document", value)}
                  placeholder={searchPlaceholder}
                  value={searchQueries.document}
                />
                <DocumentDateRangeFilter
                  from={documentDateFrom}
                  labels={dateRangeLabels}
                  onFromChange={setDocumentDateFrom}
                  onToChange={setDocumentDateTo}
                  to={documentDateTo}
                />
              </div>
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <DocumentTypeFilter
                documentTypes={documentTypes}
                label={typeFilterLabel}
                onChange={setTypeFilter}
                placeholder={typeFilterPlaceholder}
                value={typeFilter}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <PartyNameFilter
                label={searchLabels.supplier}
                names={supplierNames}
                onChange={setSupplierFilter}
                placeholder={supplierFilterPlaceholder}
                value={supplierFilter}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <PartyNameFilter
                label={searchLabels.recipient}
                names={recipientNames}
                onChange={setRecipientFilter}
                placeholder={recipientFilterPlaceholder}
                value={recipientFilter}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <RegistrySearchInput
                label={searchLabels.amount}
                onChange={(value) => handleSearchChange("amount", value)}
                placeholder={searchPlaceholder}
                value={searchQueries.amount}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <StatusFilter
                label={statusFilterLabel}
                mappingStatusLabels={mappingStatusLabels}
                onChange={setStatusFilter}
                placeholder={statusFilterPlaceholder}
                value={statusFilter}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <RegistrySearchInput
                label={searchLabels.rows}
                onChange={(value) => handleSearchChange("rows", value)}
                placeholder={searchPlaceholder}
                value={searchQueries.rows}
              />
            </TableHead>
            <TableHead aria-hidden="true" className="p-2" />
            <TableHead aria-hidden="true" className="p-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {!hasDocuments ? (
            <TableRow>
              <TableCell className="muted" colSpan={9}>
                {hasActiveSearch ? emptySearchLabel : emptyRegistryLabel}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {filteredActionableDocuments.length > 0 ? (
                <>
                  <RegistrySectionRow
                    colSpan={9}
                    title={actionableSectionTitle}
                    total={unallocatedTotal.length > 0 ? unallocatedTotal.join(" · ") : "—"}
                  />
                  {filteredActionableDocuments.map((document) => (
                    <RegistryDocumentTableRow
                      canDeleteDocuments={canDeleteDocuments}
                      key={document.id}
                      document={document}
                      locale={locale}
                      mappingStatusLabels={mappingStatusLabels}
                      pendingLabel={pendingLabel}
                      versionHistoryLabels={versionHistoryLabels}
                    />
                  ))}
                </>
              ) : null}

              {filteredCompletedGroups.length > 0 ? (
                <>
                  <RegistrySectionRow colSpan={9} title={completedSectionTitle} />
                  {filteredCompletedGroups.map((group) => {
                    const isOpen = hasActiveSearch || openMonthKey === group.key;
                    const reconciliationPath = getRegistryReconciliationPath(group.key);

                    return (
                      <Fragment key={group.key}>
                        <TableRow className="bg-[color:var(--panel)]">
                          <TableCell className="p-0" colSpan={4}>
                            <div className="flex h-full items-stretch">
                              <Button
                                aria-expanded={isOpen}
                                className="h-auto min-w-0 flex-1 justify-between rounded-none px-4 py-3 text-left text-sm font-semibold tracking-[0.06em] uppercase"
                                onClick={() =>
                                  setOpenMonthKey((currentKey) =>
                                    currentKey === group.key ? null : group.key,
                                  )
                                }
                                size="default"
                                variant="ghost"
                              >
                                <span>{group.title}</span>
                                <span className="ml-auto inline-flex items-center gap-3">
                                  <span className="text-xs font-medium text-[color:var(--ink-soft)] normal-case tracking-normal">
                                    {group.count}
                                  </span>
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={isOpen ? "size-4 rotate-180" : "size-4"}
                                  />
                                </span>
                                <span className="sr-only">{completedMonthToggleLabel}</span>
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-3 text-sm font-semibold tabular-nums">
                            {group.total.length > 0 ? group.total.join(" · ") : "—"}
                          </TableCell>
                          <TableCell className="p-0" colSpan={4}>
                            {reconciliationPath ? (
                              <div className="flex h-full items-center justify-end p-1">
                                <Button
                                  asChild
                                  className="h-auto shrink-0 gap-2 rounded-xl px-3 text-xs font-semibold tracking-[0.05em] uppercase"
                                  size="sm"
                                  variant="outline"
                                >
                                  <Link href={reconciliationPath} locale={locale}>
                                    <ClipboardCheck aria-hidden="true" className="size-4" />
                                    {reconciliationLabel}
                                  </Link>
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                        {isOpen
                          ? group.documents.map((document) => (
                              <RegistryDocumentTableRow
                                canDeleteDocuments={canDeleteDocuments}
                                key={document.id}
                                document={document}
                                locale={locale}
                                mappingStatusLabels={mappingStatusLabels}
                                pendingLabel={pendingLabel}
                                versionHistoryLabels={versionHistoryLabels}
                              />
                            ))
                          : null}
                      </Fragment>
                    );
                  })}
                </>
              ) : null}
            </>
          )}
        </TableBody>
      </Table>
    </TableShell>
  );
}
