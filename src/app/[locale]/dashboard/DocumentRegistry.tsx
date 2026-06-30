"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useState } from "react";

import { DeleteDocumentButton } from "@/app/(app)/dashboard/DeleteDocumentButton";
import { MappingStatusIcon } from "@/components/documents/mapping-status-icon";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type RegistryDocumentRow = {
  id: number;
  label: string;
  supplierTaxId: string | null;
  supplierName: string | null;
  recipientName: string | null;
  totalAmount: string | null;
  mappingStatus: MappingStatusKey;
  lineItemsCount: number;
};

type RegistryMonthGroup = {
  key: string;
  title: string;
  count: number;
  documents: RegistryDocumentRow[];
};

type DocumentRegistryProps = {
  locale: AppLocale;
  pendingLabel: string;
  emptyRegistryLabel: string;
  actionableSectionTitle: string;
  completedSectionTitle: string;
  completedMonthToggleLabel: string;
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

function RegistryDocumentTableRow({
  document,
  locale,
  pendingLabel,
  mappingStatusLabels,
}: {
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
        <DeleteDocumentButton documentId={document.id} locale={locale} />
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
  actionableSectionTitle,
  completedSectionTitle,
  completedMonthToggleLabel,
  tableLabels,
  mappingStatusLabels,
  actionableDocuments,
  completedGroups,
}: DocumentRegistryProps) {
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);
  const hasDocuments = actionableDocuments.length > 0 || completedGroups.length > 0;

  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tableLabels.document}</TableHead>
            <TableHead>{tableLabels.supplier}</TableHead>
            <TableHead>{tableLabels.recipient}</TableHead>
            <TableHead>{tableLabels.amount}</TableHead>
            <TableHead>{tableLabels.status}</TableHead>
            <TableHead>{tableLabels.rows}</TableHead>
            <TableHead>{tableLabels.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!hasDocuments ? (
            <TableRow>
              <TableCell className="muted" colSpan={7}>
                {emptyRegistryLabel}
              </TableCell>
            </TableRow>
          ) : (
            <>
              {actionableDocuments.length > 0 ? (
                <>
                  <RegistrySectionRow colSpan={7} title={actionableSectionTitle} />
                  {actionableDocuments.map((document) => (
                    <RegistryDocumentTableRow
                      key={document.id}
                      document={document}
                      locale={locale}
                      mappingStatusLabels={mappingStatusLabels}
                      pendingLabel={pendingLabel}
                    />
                  ))}
                </>
              ) : null}

              {completedGroups.length > 0 ? (
                <>
                  <RegistrySectionRow colSpan={7} title={completedSectionTitle} />
                  {completedGroups.map((group) => {
                    const isOpen = openMonthKey === group.key;

                    return (
                      <Fragment key={group.key}>
                        <TableRow className="bg-[color:var(--panel)]">
                          <TableCell className="p-0" colSpan={7}>
                            <Button
                              aria-expanded={isOpen}
                              className="h-auto w-full justify-between rounded-none px-4 py-3 text-left text-sm font-semibold tracking-[0.06em] uppercase"
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
                          </TableCell>
                        </TableRow>
                        {isOpen
                          ? group.documents.map((document) => (
                              <RegistryDocumentTableRow
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
