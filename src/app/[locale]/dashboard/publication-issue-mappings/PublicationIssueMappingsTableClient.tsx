"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { savePublicationIssueMappingRegistry } from "@/app/actions/publication-issue-mappings";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type {
  LoadPublicationIssueEditorData,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

import {
  PublicationIssueMappingEditor,
  type PublicationIssueMappingEditorHandle,
} from "./PublicationIssueMappingEditor";

type Entry = {
  editorData: LoadPublicationIssueEditorData;
  item: PublicationIssueRegistryItem;
};

export function PublicationIssueMappingsTableClient({
  documentId,
  entries,
  locale,
}: {
  documentId?: number;
  entries: Entry[];
  locale: AppLocale;
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

  const handleSaveAll = () => {
    startSaveAllTransition(async () => {
      setServerMessage({ error: null, success: null });

      const publicationSelections = new Map<number, Set<number>>();
      const issueConfirmations: Array<{
        publicationIssueId: number;
        hasConfirmedIssue: boolean;
      }> = [];

      for (const { item } of entries) {
        const handle = editorRefs.current[item.publicationIssueId];

        if (!handle) {
          continue;
        }

        const selectionState = handle.getSelections();
        const publicationSelectionSet =
          publicationSelections.get(selectionState.publicationId) ?? new Set<number>();

        for (const selectionId of selectionState.publicationSelectionIds) {
          publicationSelectionSet.add(selectionId);
        }

        publicationSelections.set(selectionState.publicationId, publicationSelectionSet);
        issueConfirmations.push({
          publicationIssueId: selectionState.publicationIssueId,
          hasConfirmedIssue: selectionState.hasConfirmedIssue,
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
        issueConfirmations,
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
      <SaveAllButton
        isSavingAll={isSavingAll}
        label={isSavingAll ? t("savePending") : t("saveSubmit")}
        onClick={handleSaveAll}
      />

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
                key={item.publicationIssueId}
                editorData={editorData}
                locale={locale}
                ref={(handle) => {
                  editorRefs.current[item.publicationIssueId] = handle;
                }}
                selectedItem={item}
              />
            ))}
          </TableBody>
        </Table>
      </TableShell>

      <SaveAllButton
        isSavingAll={isSavingAll}
        label={isSavingAll ? t("savePending") : t("saveSubmit")}
        onClick={handleSaveAll}
      />
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
