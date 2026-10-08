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
import {
  type AllocationDraft,
  allocationDraftsSchema,
  getExcludedAllocationIssueIds,
} from "@/lib/publication-mappings/allocation-drafts";
import { summarizeAllocationDrafts } from "@/lib/publication-mappings/calculations";
import { formatUnitPrice } from "@/lib/publication-mappings/price";
import type { DocumentLineAllocationDto } from "@/lib/publication-mappings/types";

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
          unitPrice: formatUnitPrice(allocation.unitPrice ?? line.unitPrice),
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
  unitPrice: formatUnitPrice(line.unitPrice),
});

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
    const parsed = allocationDraftsSchema(
      t("messages.incompleteAllocation"),
      t("messages.pricePrecision"),
      t("messages.quantityPrecision"),
    ).safeParse(
      lines.map((line) => ({
        specialDocumentId: line.specialDocumentId,
        drafts: draftsByLineId[line.specialDocumentId] ?? [],
      })),
    );
    if (!parsed.success) {
      setMessage({
        error: parsed.error.issues.some((issue) => issue.path.at(-1) === "unitPrice")
          ? t("messages.pricePrecision")
          : parsed.error.issues.some((issue) => issue.path.at(-1) === "quantity")
            ? t("messages.quantityPrecision")
            : t("messages.incompleteAllocation"),
        success: null,
      });
      return;
    }

    startSavingTransition(async () => {
      setMessage({ error: null, success: null });
      const result = await saveDocumentLineAllocations({
        documentId,
        locale,
        allocations: parsed.data,
      });
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
  const summary = useMemo(
    () =>
      summarizeAllocationDrafts(drafts, line.vatRate, {
        lineBaseAmount: line.lineBaseAmount,
        lineVatAmount: line.lineVatAmount,
        lineTotalAmount: line.lineTotalAmount,
      }),
    [drafts, line.vatRate, line.lineBaseAmount, line.lineVatAmount, line.lineTotalAmount],
  );

  return (
    <section className="grid gap-4 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--panel)] p-5">
      <div className="grid gap-1">
        <strong>{`${line.lineNo}. ${line.description}`}</strong>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[color:var(--ink-soft)]">
          <span>{t("sourceQuantity", { quantity: line.quantity })}</span>
          <span>
            {t("sourcePrice", { price: formatUnitPrice(line.unitPrice), currency: line.currency })}
          </span>
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
                excludedValues={getExcludedAllocationIssueIds(
                  drafts,
                  draft.rowId,
                  draft.externalEditionId,
                )}
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
                onBlur={() =>
                  onUpdate(draft.rowId, (current) => ({
                    ...current,
                    unitPrice: formatUnitPrice(current.unitPrice),
                  }))
                }
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
            {t("allocationQuantityTotal", { allocated: summary.quantity, source: line.quantity })}
          </span>
          <span>{t("allocationTotal", { total: `${summary.totalAmount} ${line.currency}` })}</span>
          {summary.hasMoneyWarning ? (
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
