"use client";

import { ArrowUpDown, ChevronDown, ClipboardCheck } from "lucide-react";
import { Fragment, useDeferredValue, useState } from "react";

import { DeleteDocumentButton } from "@/app/(app)/dashboard/DeleteDocumentButton";
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
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { MappingStatusKey } from "@/lib/documents/mapping-status";
import { getRegistryReconciliationPath } from "@/lib/documents/registry";
import { cn } from "@/lib/utils";

type RegistryDocumentRow = {
  id: number;
  label: string;
  documentSearchValue: string;
  supplierTaxId: string | null;
  supplierName: string | null;
  recipientName: string | null;
  totalAmount: string | null;
  totalAmountValue: number | null;
  mappingStatus: MappingStatusKey;
  lineItemsCount: number;
};

type RegistryMonthGroup = {
  key: string;
  title: string;
  count: number;
  documents: RegistryDocumentRow[];
};

type SearchKey = "document" | "supplier" | "recipient" | "amount" | "rows";
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
  searchLabels: Record<SearchKey, string>;
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
    supplier: string;
    recipient: string;
    amount: string;
    status: string;
    rows: string;
    actions: string;
  };
  mappingStatusLabels: Record<MappingStatusKey, string>;
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
      className="h-9 min-w-28 rounded-xl px-3 py-2 text-xs"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="search"
      value={value}
    />
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
          className="h-9 w-full min-w-28 justify-between rounded-xl px-3 text-xs"
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
}: {
  canDeleteDocuments: boolean;
  document: RegistryDocumentRow;
  locale: AppLocale;
  pendingLabel: string;
  mappingStatusLabels: Record<MappingStatusKey, string>;
}) {
  const href = `/dashboard/documents/${document.id}`;
  const rowCellClassName = "transition-colors group-hover:bg-[rgba(177,74,47,0.08)]";
  const rowLinkClassName =
    "block -mx-4 -my-[14px] px-4 py-[14px] focus-visible:bg-[rgba(177,74,47,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-inset";

  return (
    <TableRow className="group">
      <TableCell className={rowCellClassName}>
        <Link className={rowLinkClassName} href={href} locale={locale}>
          <strong>{document.label}</strong>
          <div className="muted">{document.supplierTaxId ?? pendingLabel}</div>
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
      <TableCell className={cn(rowCellClassName)} data-row-action>
        {canDeleteDocuments ? (
          <DeleteDocumentButton documentId={document.id} locale={locale} />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function RegistrySectionRow({
  title,
  colSpan,
}: {
  title: string;
  colSpan: number;
}) {
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
  actionableDocuments,
  completedGroups,
}: DocumentRegistryProps) {
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<SearchQueries>({
    document: "",
    supplier: "",
    recipient: "",
    amount: "",
    rows: "",
  });
  const [statusFilter, setStatusFilter] = useState<MappingStatusKey | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("ascending");
  const deferredSearchQueries = useDeferredValue(searchQueries);
  const normalizedSearchQueries: SearchQueries = {
    document: deferredSearchQueries.document.trim().toLocaleLowerCase(locale),
    supplier: deferredSearchQueries.supplier.trim().toLocaleLowerCase(locale),
    recipient: deferredSearchQueries.recipient.trim().toLocaleLowerCase(locale),
    amount: deferredSearchQueries.amount.trim().toLocaleLowerCase(locale),
    rows: deferredSearchQueries.rows.trim().toLocaleLowerCase(locale),
  };
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });

  const matchesSearch = (document: RegistryDocumentRow) =>
    (!normalizedSearchQueries.document ||
      document.documentSearchValue
        .toLocaleLowerCase(locale)
        .includes(normalizedSearchQueries.document)) &&
    (!normalizedSearchQueries.supplier ||
      document.supplierName
        ?.toLocaleLowerCase(locale)
        .includes(normalizedSearchQueries.supplier)) &&
    (!normalizedSearchQueries.recipient ||
      document.recipientName
        ?.toLocaleLowerCase(locale)
        .includes(normalizedSearchQueries.recipient)) &&
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
    return documents.length > 0 ? [{ ...group, count: documents.length, documents }] : [];
  });
  const hasDocuments = filteredActionableDocuments.length > 0 || filteredCompletedGroups.length > 0;
  const hasActiveSearch =
    statusFilter !== null || Object.values(searchQueries).some((query) => Boolean(query.trim()));

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
      <Table>
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
            <TableHead>{tableLabels.actions}</TableHead>
          </TableRow>
          <TableRow className="bg-[color:var(--panel-strong)]">
            <TableHead className="p-2 normal-case tracking-normal">
              <RegistrySearchInput
                label={searchLabels.document}
                onChange={(value) => handleSearchChange("document", value)}
                placeholder={searchPlaceholder}
                value={searchQueries.document}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <RegistrySearchInput
                label={searchLabels.supplier}
                onChange={(value) => handleSearchChange("supplier", value)}
                placeholder={searchPlaceholder}
                value={searchQueries.supplier}
              />
            </TableHead>
            <TableHead className="p-2 normal-case tracking-normal">
              <RegistrySearchInput
                label={searchLabels.recipient}
                onChange={(value) => handleSearchChange("recipient", value)}
                placeholder={searchPlaceholder}
                value={searchQueries.recipient}
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {!hasDocuments ? (
            <TableRow>
              <TableCell className="muted" colSpan={7}>
                {hasActiveSearch ? emptySearchLabel : emptyRegistryLabel}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {filteredActionableDocuments.length > 0 ? (
                <>
                  <RegistrySectionRow colSpan={7} title={actionableSectionTitle} />
                  {filteredActionableDocuments.map((document) => (
                    <RegistryDocumentTableRow
                      canDeleteDocuments={canDeleteDocuments}
                      key={document.id}
                      document={document}
                      locale={locale}
                      mappingStatusLabels={mappingStatusLabels}
                      pendingLabel={pendingLabel}
                    />
                  ))}
                </>
              ) : null}

              {filteredCompletedGroups.length > 0 ? (
                <>
                  <RegistrySectionRow colSpan={7} title={completedSectionTitle} />
                  {filteredCompletedGroups.map((group) => {
                    const isOpen = hasActiveSearch || openMonthKey === group.key;
                    const reconciliationPath = getRegistryReconciliationPath(group.key);

                    return (
                      <Fragment key={group.key}>
                        <TableRow className="bg-[color:var(--panel)]">
                          <TableCell className="p-0" colSpan={7}>
                            <div className="flex items-stretch">
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
                              {reconciliationPath ? (
                                <Button
                                  asChild
                                  className="m-1 h-auto shrink-0 gap-2 rounded-xl px-3 text-xs font-semibold tracking-[0.05em] uppercase"
                                  size="sm"
                                  variant="outline"
                                >
                                  <Link href={reconciliationPath} locale={locale}>
                                    <ClipboardCheck aria-hidden="true" className="size-4" />
                                    {reconciliationLabel}
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
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
