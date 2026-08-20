"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  saveDocumentLineAllocations,
  searchDocumentAllocationEditions,
  searchDocumentAllocationIssues,
  searchIssueNumberMappingCandidates,
  searchPublicationMappingCandidates,
} from "@/app/actions/publication-issue-mappings";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { DocumentLineAllocationDto } from "@/lib/publication-mappings/types";

type AllocationDraft = {
  rowId: string;
  externalEditionId: number | null;
  externalEditionName: string;
  externalIssueId: number | null;
  externalIssueNumber: string;
  quantity: string;
  unitPrice: string;
};

const toInitialDrafts = (line: DocumentLineAllocationDto): AllocationDraft[] => {
  if (line.allocations.length > 0) {
    return line.allocations.flatMap((allocation, index) => {
      if (allocation.externalIssueId === null || allocation.externalIssueNumber === null) {
        return [];
      }
      return [
        {
          rowId: `saved-${line.specialDocumentId}-${index}`,
          externalEditionId: allocation.externalEditionId,
          externalEditionName: allocation.externalEditionName,
          externalIssueId: allocation.externalIssueId,
          externalIssueNumber: allocation.externalIssueNumber,
          quantity: allocation.quantity,
          unitPrice: allocation.unitPrice ?? line.unitPrice,
        },
      ];
    });
  }

  return [createDraft(line, 0)];
};

const createDraft = (line: DocumentLineAllocationDto, index: number): AllocationDraft => ({
  rowId: `draft-${line.specialDocumentId}-${index}`,
  externalEditionId: null,
  externalEditionName: "",
  externalIssueId: null,
  externalIssueNumber: "",
  quantity: line.quantity,
  unitPrice: line.unitPrice,
});

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getLineTotal = (line: DocumentLineAllocationDto) =>
  Number(line.lineTotalAmount ?? Number(line.lineBaseAmount) + Number(line.lineVatAmount));

const getVatRatePercent = (vatRate: string | null) => {
  const match = vatRate?.replace(",", ".").match(/\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : 0;
};

export function DocumentLineAllocationsClient({
  documentId,
  lines,
  locale,
  saveLabel,
}: {
  documentId: number;
  lines: DocumentLineAllocationDto[];
  locale: AppLocale;
  saveLabel?: string;
}) {
  const t = useTranslations("PublicationMappings");
  const router = useRouter();
  const [isSaving, startSavingTransition] = useTransition();
  const nextDraftIdRef = useRef(1);
  const [message, setMessage] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const [draftsByLineId, setDraftsByLineId] = useState<Record<number, AllocationDraft[]>>(() =>
    Object.fromEntries(lines.map((line) => [line.specialDocumentId, toInitialDrafts(line)])),
  );

  const updateDraft = (
    specialDocumentId: number,
    rowId: string,
    updater: (draft: AllocationDraft) => AllocationDraft,
  ) => {
    setDraftsByLineId((current) => ({
      ...current,
      [specialDocumentId]: (current[specialDocumentId] ?? []).map((draft) =>
        draft.rowId === rowId ? updater(draft) : draft,
      ),
    }));
  };

  const appendDraft = (line: DocumentLineAllocationDto) => {
    const draftIndex = nextDraftIdRef.current;
    nextDraftIdRef.current += 1;

    setDraftsByLineId((current) => {
      const drafts = current[line.specialDocumentId] ?? [];
      return {
        ...current,
        [line.specialDocumentId]: [...drafts, createDraft(line, draftIndex)],
      };
    });
  };

  const removeDraft = (specialDocumentId: number, rowId: string) => {
    setDraftsByLineId((current) => ({
      ...current,
      [specialDocumentId]: (current[specialDocumentId] ?? []).filter(
        (draft) => draft.rowId !== rowId,
      ),
    }));
  };

  const handleSave = () => {
    startSavingTransition(async () => {
      setMessage({ error: null, success: null });
      const allocations = lines.flatMap((line) => {
        const drafts = draftsByLineId[line.specialDocumentId] ?? [];
        const completeDrafts = drafts.filter(
          (draft) => draft.externalEditionId !== null && draft.externalIssueId !== null,
        );

        return [
          {
            specialDocumentId: line.specialDocumentId,
            matchDetails: completeDrafts.map((draft) => ({
              externalEditionId: draft.externalEditionId as number,
              externalEditionName: draft.externalEditionName,
              externalIssueId: draft.externalIssueId as number,
              externalIssueNumber: draft.externalIssueNumber,
              quantity: draft.quantity,
              unitPrice: draft.unitPrice,
            })),
          },
        ];
      });

      const result = await saveDocumentLineAllocations({ documentId, locale, allocations });
      if (result.errorKey) {
        setMessage({ error: t(`messages.${result.errorKey}`), success: null });
        return;
      }
      setMessage({ error: null, success: t("messages.saved") });
      router.refresh();
    });
  };

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <Button disabled={isSaving} onClick={handleSave} type="button">
          <Save className="size-4" />
          {isSaving ? t("savePending") : (saveLabel ?? t("saveSubmit"))}
        </Button>
      </div>

      {message.error ? (
        <p className="text-sm text-[color:var(--accent-strong)]">{message.error}</p>
      ) : null}
      {message.success ? (
        <p className="text-sm text-[color:var(--success)]">{message.success}</p>
      ) : null}

      {lines.map((line) => (
        <DocumentLineAllocationEditor
          drafts={draftsByLineId[line.specialDocumentId] ?? []}
          key={line.specialDocumentId}
          line={line}
          locale={locale}
          onAppend={() => appendDraft(line)}
          onRemove={(rowId) => removeDraft(line.specialDocumentId, rowId)}
          onUpdate={(rowId, updater) => updateDraft(line.specialDocumentId, rowId, updater)}
        />
      ))}
    </div>
  );
}

function DocumentLineAllocationEditor({
  drafts,
  line,
  locale,
  onAppend,
  onRemove,
  onUpdate,
}: {
  drafts: AllocationDraft[];
  line: DocumentLineAllocationDto;
  locale: AppLocale;
  onAppend: () => void;
  onRemove: (rowId: string) => void;
  onUpdate: (rowId: string, updater: (draft: AllocationDraft) => AllocationDraft) => void;
}) {
  const t = useTranslations("PublicationMappings");
  const [searchError, setSearchError] = useState<string | null>(null);
  const allocatedQuantity = useMemo(
    () => drafts.reduce((sum, draft) => sum + (Number(draft.quantity) || 0), 0),
    [drafts],
  );
  const allocatedTotal = useMemo(
    () =>
      drafts.reduce((sum, draft) => {
        const base = (Number(draft.quantity) || 0) * (Number(draft.unitPrice) || 0);
        const vatRate = getVatRatePercent(line.vatRate);
        return sum + roundMoney(base + (base * vatRate) / 100);
      }, 0),
    [drafts, line.vatRate],
  );
  const hasMoneyWarning = Math.abs(allocatedTotal - getLineTotal(line)) > 0.009;

  const excludedEditionIds = (rowId: string) =>
    new Set(
      drafts.flatMap((draft) =>
        draft.rowId === rowId || draft.externalEditionId === null ? [] : [draft.externalEditionId],
      ),
    );
  const excludedIssueIds = (rowId: string) =>
    new Set(
      drafts.flatMap((draft) =>
        draft.rowId === rowId || draft.externalIssueId === null ? [] : [draft.externalIssueId],
      ),
    );

  return (
    <section className="grid gap-4 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel)] p-5">
      <div className="grid gap-1">
        <strong>{`${line.lineNo}. ${line.description}`}</strong>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--ink-soft)]">
          <span>{t("sourceQuantity", { quantity: line.quantity })}</span>
          <span>{t("sourcePrice", { price: line.unitPrice, currency: line.currency })}</span>
        </div>
      </div>

      <div className="grid gap-3">
        {drafts.map((draft) => (
          <div
            className="grid items-end gap-3 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-3 lg:grid-cols-[minmax(13rem,1fr)_minmax(10rem,0.8fr)_8rem_8rem_auto]"
            key={draft.rowId}
          >
            <label className="grid gap-1 text-xs text-[color:var(--ink-soft)]">
              {t("allocationPublication")}
              <Combobox
                excludedValues={excludedEditionIds(draft.rowId)}
                initialOptions={
                  draft.externalEditionId
                    ? [{ value: draft.externalEditionId, label: draft.externalEditionName }]
                    : []
                }
                messages={{
                  clear: t("clearSelection"),
                  empty: t("emptyPublicationCandidates"),
                  searching: t("searchPending"),
                  searchPlaceholder: t("publicationSearchPlaceholder"),
                }}
                onSearch={async (query) => {
                  const result = line.publicationIssueId
                    ? await searchPublicationMappingCandidates({
                        locale,
                        publicationIssueId: line.publicationIssueId,
                        query,
                      })
                    : await searchDocumentAllocationEditions({ locale, query });
                  if (result.errorKey) {
                    setSearchError(t(`messages.${result.errorKey}`));
                    return [];
                  }
                  return result.candidates.map((candidate) => ({
                    value: candidate.externalEditionId,
                    label: candidate.externalEditionName,
                  }));
                }}
                onSelect={(option) =>
                  onUpdate(draft.rowId, (current) => ({
                    ...current,
                    externalEditionId: option?.value ?? null,
                    externalEditionName: option?.label ?? "",
                    externalIssueId: null,
                    externalIssueNumber: "",
                  }))
                }
                placeholder={t("publicationComboboxPlaceholder")}
                selectedOption={
                  draft.externalEditionId
                    ? { value: draft.externalEditionId, label: draft.externalEditionName }
                    : null
                }
              />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--ink-soft)]">
              {t("allocationIssue")}
              <Combobox
                disabled={draft.externalEditionId === null}
                excludedValues={excludedIssueIds(draft.rowId)}
                initialOptions={
                  draft.externalIssueId
                    ? [{ value: draft.externalIssueId, label: draft.externalIssueNumber }]
                    : []
                }
                messages={{
                  clear: t("clearSelection"),
                  empty: t("emptyIssueNumberCandidates"),
                  searching: t("searchPending"),
                  searchPlaceholder: t("issueNumberSearchPlaceholder"),
                }}
                normalizedClientFilter
                onSearch={async (query) => {
                  if (draft.externalEditionId === null) return [];
                  const result = line.publicationIssueId
                    ? await searchIssueNumberMappingCandidates({
                        locale,
                        publicationIssueId: line.publicationIssueId,
                        externalEditionId: draft.externalEditionId,
                        query,
                      })
                    : await searchDocumentAllocationIssues({
                        locale,
                        externalEditionId: draft.externalEditionId,
                        query,
                      });
                  if (result.errorKey) {
                    setSearchError(t(`messages.${result.errorKey}`));
                    return [];
                  }
                  return result.candidates.map((candidate) => ({
                    value: candidate.externalIssueId,
                    label: candidate.externalIssueNumber,
                  }));
                }}
                onSelect={(option) =>
                  onUpdate(draft.rowId, (current) => ({
                    ...current,
                    externalIssueId: option?.value ?? null,
                    externalIssueNumber: option?.label ?? "",
                  }))
                }
                placeholder={t("issueNumberComboboxPlaceholder")}
                selectedOption={
                  draft.externalIssueId
                    ? { value: draft.externalIssueId, label: draft.externalIssueNumber }
                    : null
                }
              />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--ink-soft)]">
              {t("allocationQuantity")}
              <Input
                min="0"
                onChange={(event) =>
                  onUpdate(draft.rowId, (current) => ({ ...current, quantity: event.target.value }))
                }
                step="0.001"
                type="number"
                value={draft.quantity}
              />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--ink-soft)]">
              {t("allocationPrice")}
              <Input
                min="0"
                onChange={(event) =>
                  onUpdate(draft.rowId, (current) => ({
                    ...current,
                    unitPrice: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={draft.unitPrice}
              />
            </label>
            <Button
              aria-label={t("allocationRemove")}
              disabled={drafts.length === 1}
              onClick={() => onRemove(draft.rowId)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="grid gap-1">
          <span>
            {t("allocationQuantityTotal", { allocated: allocatedQuantity, source: line.quantity })}
          </span>
          <span>
            {t("allocationTotal", { total: `${allocatedTotal.toFixed(2)} ${line.currency}` })}
          </span>
          {hasMoneyWarning ? (
            <span className="text-[color:var(--accent-strong)]">{t("allocationMoneyWarning")}</span>
          ) : null}
          {searchError ? (
            <span className="text-[color:var(--accent-strong)]">{searchError}</span>
          ) : null}
        </div>
        <Button onClick={onAppend} size="sm" type="button" variant="outline">
          <Plus className="size-4" />
          {t("allocationAdd")}
        </Button>
      </div>
    </section>
  );
}
