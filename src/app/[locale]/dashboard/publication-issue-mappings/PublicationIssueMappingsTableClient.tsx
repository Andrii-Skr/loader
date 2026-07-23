"use client";

import { Plus, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useRef, useState, useTransition } from "react";

import { savePublicationIssueMappingRegistry } from "@/app/actions/publication-issue-mappings";
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
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type {
  DocumentLineAllocationDto,
  LoadPublicationIssueEditorData,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

import { DocumentLineAllocationsClient } from "./DocumentLineAllocationsClient";
import {
  PublicationIssueMappingEditor,
  type PublicationIssueMappingEditorHandle,
} from "./PublicationIssueMappingEditor";

type Entry = {
  editorData: LoadPublicationIssueEditorData;
  item: PublicationIssueRegistryItem;
};

export function PublicationIssueMappingsTableClient({
  allocationSaveLabel,
  documentId,
  documentLines = [],
  entries,
  locale,
  saveLabel,
  savePendingLabel,
}: {
  allocationSaveLabel: string;
  documentId?: number;
  documentLines?: DocumentLineAllocationDto[];
  entries: Entry[];
  locale: AppLocale;
  saveLabel: string;
  savePendingLabel: string;
}) {
  const t = useTranslations("PublicationMappings");
  const router = useRouter();
  const [isSavingAll, startSaveAllTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<{
    error: string | null;
    success: string | null;
  }>({
    error: null,
    success: null,
  });
  const editorRefs = useRef<Record<number, PublicationIssueMappingEditorHandle | null>>({});
  const [expandedUnparsedLineId, setExpandedUnparsedLineId] = useState<number | null>(null);
  const unparsedLines = documentLines.filter((line) => line.publicationIssueId === null);

  const handleSaveAll = () => {
    startSaveAllTransition(async () => {
      setServerMessage({ error: null, success: null });

      const publicationSelections = new Map<number, Set<number>>();
      const issueMatches: Array<{
        publicationIssueId: number;
        matchedIssue: {
          externalEditionId: number;
          externalEditionName: string;
          externalIssueId: number;
          externalIssueNumber: string;
        } | null;
      }> = [];

      for (const { item } of entries) {
        const handle = editorRefs.current[item.publicationIssueId];

        if (!handle) {
          continue;
        }

        const selectionState = handle.getSelections();

        if (!selectionState) {
          continue;
        }
        const publicationSelectionSet =
          publicationSelections.get(selectionState.publicationId) ?? new Set<number>();

        for (const selectionId of selectionState.publicationSelectionIds) {
          publicationSelectionSet.add(selectionId);
        }

        publicationSelections.set(selectionState.publicationId, publicationSelectionSet);
        issueMatches.push({
          publicationIssueId: selectionState.publicationIssueId,
          matchedIssue: selectionState.matchedIssue,
        });
      }

      const result = await savePublicationIssueMappingRegistry({
        documentId,
        locale,
        publicationSelections: Array.from(publicationSelections.entries()).map(
          ([publicationId, selectionIds]) => ({
            publicationId,
            selectionIds: Array.from(selectionIds),
          }),
        ),
        issueMatches,
      });

      if (result.errorKey) {
        setServerMessage({ error: t(`messages.${result.errorKey}`), success: null });
        return;
      }

      setServerMessage({ error: null, success: t("messages.saved") });
      if (entries.length > 0) {
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-4">
      {entries.length > 0 ? (
        <SaveAllButton
          isSavingAll={isSavingAll}
          label={isSavingAll ? savePendingLabel : saveLabel}
          onClick={handleSaveAll}
        />
      ) : null}

      {serverMessage.success ? (
        <p className="text-sm text-[color:var(--success)]">{serverMessage.success}</p>
      ) : null}
      {serverMessage.error ? (
        <p className="text-sm text-[color:var(--accent-strong)]">{serverMessage.error}</p>
      ) : null}

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%] min-w-[13rem]">
                {t("registryTable.parsedPublication")}
              </TableHead>
              <TableHead className="w-[11%] min-w-[8rem]">
                {t("registryTable.parsedIssueNumber")}
              </TableHead>
              <TableHead className="w-[28%] min-w-[16rem]">
                {t("registryTable.externalPublication")}
              </TableHead>
              <TableHead className="w-[22%] min-w-[12rem]">
                {t("registryTable.externalIssueNumber")}
              </TableHead>
              <TableHead className="w-[17%] min-w-[8.5rem] text-center">
                {t("registryTable.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(({ item, editorData }) => (
              <PublicationIssueMappingEditor
                allocationLines={documentLines.filter(
                  (line) => line.publicationIssueId === item.publicationIssueId,
                )}
                allocationSaveLabel={allocationSaveLabel}
                documentId={documentId}
                key={item.publicationIssueId}
                editorData={editorData}
                locale={locale}
                ref={(handle) => {
                  editorRefs.current[item.publicationIssueId] = handle;
                }}
                selectedItem={item}
              />
            ))}
            {unparsedLines.map((line) => {
              const isExpanded = expandedUnparsedLineId === line.specialDocumentId;

              return (
                <Fragment key={line.specialDocumentId}>
                  <TableRow>
                    <TableCell>
                      <strong>{line.description}</strong>
                    </TableCell>
                    <TableCell className="muted">{t("unparsedLine")}</TableCell>
                    <TableCell className="muted">—</TableCell>
                    <TableCell className="muted">—</TableCell>
                    <TableCell className="text-center">
                      <Button
                        aria-label={t("addRow")}
                        onClick={() => setExpandedUnparsedLineId(line.specialDocumentId)}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && documentId ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <DocumentLineAllocationsClient
                          documentId={documentId}
                          lines={[line]}
                          locale={locale}
                          saveLabel={allocationSaveLabel}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableShell>

      {entries.length > 0 ? (
        <SaveAllButton
          isSavingAll={isSavingAll}
          label={isSavingAll ? savePendingLabel : saveLabel}
          onClick={handleSaveAll}
        />
      ) : null}
    </div>
  );
}

function SaveAllButton({
  isSavingAll,
  label,
  onClick,
}: {
  isSavingAll: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-end">
      <Button disabled={isSavingAll} onClick={onClick} type="button">
        <Save className="size-4" />
        {label}
      </Button>
    </div>
  );
}
