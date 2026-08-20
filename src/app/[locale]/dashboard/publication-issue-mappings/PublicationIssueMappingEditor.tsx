"use client";

import { ChevronUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  loadPublicationIssueOccurrences,
  searchIssueNumberMappingCandidates,
  searchPublicationMappingCandidates,
} from "@/app/actions/publication-issue-mappings";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppLocale } from "@/i18n/routing";
import {
  buildSavedMappingRows,
  collectSelectionIdsFromRows,
  createDraftMappingRow,
  getRowExternalEditionId,
  pickInitialIssueCandidate,
  pickInitialPublicationCandidate,
  syncIssueSelectionWithCandidates,
  toIssueDraftSelection,
} from "@/lib/publication-mappings/editor";
import {
  getOccurrenceDocumentLabel,
  getOccurrenceRawText,
} from "@/lib/publication-mappings/tooltip";
import type {
  DocumentLineAllocationDto,
  IssueNumberCandidateDto,
  LoadPublicationIssueEditorData,
  PublicationCandidateDto,
  PublicationIssueDocumentOccurrence,
  PublicationIssueMappingRow,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

import { DocumentLineAllocationsClient } from "./DocumentLineAllocationsClient";

export type PublicationIssueMappingEditorHandle = {
  getSelections: () => {
    publicationIssueId: number;
    publicationId: number;
    matchedIssue: {
      externalEditionId: number;
      externalEditionName: string;
      externalIssueId: number;
      externalIssueNumber: string;
    } | null;
    publicationSelectionIds: number[];
  } | null;
};

const toPublicationOption = (candidate: PublicationCandidateDto): ComboboxOption => ({
  value: candidate.externalEditionId,
  label: candidate.externalEditionName,
  score: candidate.score,
});

const toIssueNumberOption = (candidate: IssueNumberCandidateDto): ComboboxOption => ({
  value: candidate.externalIssueId,
  label: candidate.externalIssueNumber,
  score: candidate.score,
});

const buildInitialRows = ({
  autoSelectedPublicationCandidateId,
  initialIssueNumberCandidatesByEditionId,
  publicationCandidates,
  selectedItem,
}: {
  autoSelectedPublicationCandidateId: number | null;
  initialIssueNumberCandidatesByEditionId: Record<number, IssueNumberCandidateDto[]>;
  publicationCandidates: PublicationCandidateDto[];
  selectedItem: PublicationIssueRegistryItem;
}): PublicationIssueMappingRow[] => {
  const initialPublicationCandidate =
    publicationCandidates.find(
      (candidate) => candidate.externalEditionId === autoSelectedPublicationCandidateId,
    ) ?? pickInitialPublicationCandidate(publicationCandidates);
  const savedRows = buildSavedMappingRows({
    parsedPublicationName: selectedItem.publicationName,
    parsedIssueNumber: selectedItem.parsedIssueNumber,
    publicationMappings: selectedItem.publicationMappings,
  });

  if (savedRows.length === 0) {
    const initialIssueNumberCandidate = initialPublicationCandidate
      ? pickInitialIssueCandidate(
          initialIssueNumberCandidatesByEditionId[initialPublicationCandidate.externalEditionId] ??
            [],
        )
      : null;
    const savedDocumentIssueSelection =
      selectedItem.savedDocumentIssueMatch &&
      selectedItem.savedDocumentIssueMatch.externalEditionId ===
        initialPublicationCandidate?.externalEditionId
        ? toIssueDraftSelection(selectedItem.savedDocumentIssueMatch)
        : null;

    return [
      {
        ...createDraftMappingRow({
          parsedPublicationName: selectedItem.publicationName,
          parsedIssueNumber: selectedItem.parsedIssueNumber,
          rowId: `base-${selectedItem.publicationIssueId}`,
        }),
        draftPublicationSelection: initialPublicationCandidate
          ? {
              externalEditionId: initialPublicationCandidate.externalEditionId,
              externalEditionName: initialPublicationCandidate.externalEditionName,
            }
          : null,
        draftIssueSelection: initialIssueNumberCandidate
          ? toIssueDraftSelection(initialIssueNumberCandidate)
          : savedDocumentIssueSelection,
      },
    ];
  }

  return savedRows.map((row) => ({
    ...row,
    draftPublicationSelection:
      row.savedPublicationMapping === null && initialPublicationCandidate
        ? {
            externalEditionId: initialPublicationCandidate.externalEditionId,
            externalEditionName: initialPublicationCandidate.externalEditionName,
          }
        : null,
    draftIssueSelection:
      row.savedPublicationMapping !== null
        ? selectedItem.savedDocumentIssueMatch &&
          selectedItem.savedDocumentIssueMatch.externalEditionId ===
            row.savedPublicationMapping.externalEditionId
          ? toIssueDraftSelection(selectedItem.savedDocumentIssueMatch)
          : null
        : initialPublicationCandidate
          ? (() => {
              const initialIssueNumberCandidate = pickInitialIssueCandidate(
                initialIssueNumberCandidatesByEditionId[
                  initialPublicationCandidate.externalEditionId
                ] ?? [],
              );

              if (initialIssueNumberCandidate) {
                return toIssueDraftSelection(initialIssueNumberCandidate);
              }

              return selectedItem.savedDocumentIssueMatch &&
                selectedItem.savedDocumentIssueMatch.externalEditionId ===
                  initialPublicationCandidate.externalEditionId
                ? toIssueDraftSelection(selectedItem.savedDocumentIssueMatch)
                : null;
            })()
          : row.draftIssueSelection,
  }));
};

export const PublicationIssueMappingEditor = forwardRef<
  PublicationIssueMappingEditorHandle,
  {
    allocationSaveLabel: string;
    editorData: LoadPublicationIssueEditorData;
    documentId?: number;
    allocationLines?: DocumentLineAllocationDto[];
    locale: AppLocale;
    selectedItem: PublicationIssueRegistryItem;
  }
>(function PublicationIssueMappingEditor(
  { allocationLines = [], allocationSaveLabel, documentId, editorData, locale, selectedItem },
  ref,
) {
  const t = useTranslations("PublicationMappings");
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isAllocationExpanded, setIsAllocationExpanded] = useState(false);
  const draftRowCounterRef = useRef(0);
  const [issueNumberCandidatesByEditionId, setIssueNumberCandidatesByEditionId] = useState<
    Record<number, IssueNumberCandidateDto[]>
  >(() => editorData.initialIssueNumberCandidatesByEditionId);
  const [rows, setRows] = useState<PublicationIssueMappingRow[]>(() =>
    buildInitialRows({
      autoSelectedPublicationCandidateId: editorData.autoSelectedPublicationCandidateId,
      initialIssueNumberCandidatesByEditionId: editorData.initialIssueNumberCandidatesByEditionId,
      publicationCandidates: editorData.publicationCandidates,
      selectedItem,
    }),
  );

  const publicationOptions = useMemo(
    () => editorData.publicationCandidates.map(toPublicationOption),
    [editorData.publicationCandidates],
  );
  useEffect(() => {
    draftRowCounterRef.current = 0;
    setIssueNumberCandidatesByEditionId(editorData.initialIssueNumberCandidatesByEditionId);
    setRows(
      buildInitialRows({
        autoSelectedPublicationCandidateId: editorData.autoSelectedPublicationCandidateId,
        initialIssueNumberCandidatesByEditionId: editorData.initialIssueNumberCandidatesByEditionId,
        publicationCandidates: editorData.publicationCandidates,
        selectedItem,
      }),
    );
    setServerMessage(null);
    setIsAllocationExpanded(false);
  }, [
    editorData.autoSelectedPublicationCandidateId,
    editorData.initialIssueNumberCandidatesByEditionId,
    editorData.publicationCandidates,
    selectedItem,
  ]);

  const updateRow = (
    rowId: string,
    updater: (row: PublicationIssueMappingRow) => PublicationIssueMappingRow,
  ) => {
    setRows((currentRows) => currentRows.map((row) => (row.rowId === rowId ? updater(row) : row)));
  };

  const loadIssueNumberOptions = async ({
    externalEditionId,
    query,
  }: {
    externalEditionId: number;
    query?: string;
  }) => {
    const result = await searchIssueNumberMappingCandidates({
      publicationIssueId: selectedItem.publicationIssueId,
      locale,
      externalEditionId,
      query,
    });

    if (result.errorKey) {
      setServerMessage(t(`messages.${result.errorKey}`));
      return [];
    }

    setServerMessage(null);
    if (!query?.trim()) {
      setIssueNumberCandidatesByEditionId((current) => ({
        ...current,
        [externalEditionId]: result.candidates,
      }));
    }

    return result.candidates;
  };

  const appendDraftRow = () => {
    draftRowCounterRef.current += 1;
    setRows((currentRows) => [
      ...currentRows,
      createDraftMappingRow({
        parsedPublicationName: selectedItem.publicationName,
        parsedIssueNumber: selectedItem.parsedIssueNumber,
        rowId: `draft-${selectedItem.publicationIssueId}-${draftRowCounterRef.current}`,
      }),
    ]);
  };

  const handleAddRow = () => {
    if (documentId && allocationLines.length > 0) {
      setIsAllocationExpanded(true);
      return;
    }

    appendDraftRow();
  };

  const removeDraftRow = (rowId: string) => {
    setRows((currentRows) => currentRows.filter((row) => row.rowId !== rowId));
  };

  const getExcludedPublicationIds = (rowId: string) =>
    new Set(
      rows.flatMap((row) => {
        if (row.rowId === rowId) {
          return [];
        }

        return [
          row.savedPublicationMapping?.externalEditionId,
          row.draftPublicationSelection?.externalEditionId,
        ].filter((value): value is number => Number.isInteger(value));
      }),
    );

  const getExcludedIssueNumberIds = (rowId: string) =>
    new Set(
      rows.flatMap((row) => {
        if (row.rowId === rowId) {
          return [];
        }

        return [row.draftIssueSelection?.externalIssueId].filter((value): value is number =>
          Number.isInteger(value),
        );
      }),
    );

  useImperativeHandle(
    ref,
    () => ({
      getSelections: () => {
        if (isAllocationExpanded) {
          return null;
        }

        const { publicationSelectionIds } = collectSelectionIdsFromRows(rows);
        const selectedIssueRow =
          rows.find(
            (row) => row.draftIssueSelection !== null && getRowExternalEditionId(row) !== null,
          ) ?? null;

        return {
          publicationIssueId: selectedItem.publicationIssueId,
          publicationId: selectedItem.publicationId,
          matchedIssue: selectedIssueRow?.draftIssueSelection
            ? {
                externalEditionId: getRowExternalEditionId(selectedIssueRow) as number,
                externalEditionName:
                  selectedIssueRow.savedPublicationMapping?.externalEditionName ??
                  selectedIssueRow.draftPublicationSelection?.externalEditionName ??
                  "",
                externalIssueId: selectedIssueRow.draftIssueSelection.externalIssueId,
                externalIssueNumber: selectedIssueRow.draftIssueSelection.externalIssueNumber,
              }
            : null,
          publicationSelectionIds,
        };
      },
    }),
    [isAllocationExpanded, rows, selectedItem.publicationId, selectedItem.publicationIssueId],
  );

  const renderPublicationCell = (row: PublicationIssueMappingRow) => {
    if (row.savedPublicationMapping) {
      return (
        <LockedValueCell
          label={row.savedPublicationMapping.externalEditionName}
          onRemove={() =>
            updateRow(row.rowId, (currentRow) => ({
              ...currentRow,
              savedPublicationMapping: null,
            }))
          }
          removeLabel={t("removePublication")}
        />
      );
    }

    return (
      <Combobox
        contentClassName="w-[min(34rem,max(28rem,var(--radix-popover-trigger-width)))]"
        excludedValues={getExcludedPublicationIds(row.rowId)}
        initialOptions={publicationOptions}
        messages={{
          clear: t("clearSelection"),
          empty: t("emptyPublicationCandidates"),
          searching: t("searchPending"),
          searchPlaceholder: t("publicationSearchPlaceholder"),
        }}
        onSearch={async (query) => {
          const result = await searchPublicationMappingCandidates({
            publicationIssueId: selectedItem.publicationIssueId,
            locale,
            query,
          });

          if (result.errorKey) {
            setServerMessage(t(`messages.${result.errorKey}`));
            return [];
          }

          return result.candidates.map(toPublicationOption);
        }}
        onSelect={async (option) => {
          const nextPublicationSelection = option
            ? {
                externalEditionId: option.value,
                externalEditionName: option.label,
              }
            : null;

          let nextIssueCandidates: IssueNumberCandidateDto[] = [];

          if (nextPublicationSelection) {
            nextIssueCandidates =
              issueNumberCandidatesByEditionId[nextPublicationSelection.externalEditionId] ??
              (await loadIssueNumberOptions({
                externalEditionId: nextPublicationSelection.externalEditionId,
              }));
          }

          updateRow(row.rowId, (currentRow) => ({
            ...currentRow,
            draftPublicationSelection: nextPublicationSelection,
            draftIssueSelection: syncIssueSelectionWithCandidates({
              candidates: nextIssueCandidates,
              selection: currentRow.draftIssueSelection,
            }),
          }));
        }}
        placeholder={t("publicationComboboxPlaceholder")}
        selectedOption={
          row.draftPublicationSelection
            ? {
                value: row.draftPublicationSelection.externalEditionId,
                label: row.draftPublicationSelection.externalEditionName,
              }
            : null
        }
        widthClassName="min-w-[16rem]"
      />
    );
  };

  const renderIssueNumberCell = (row: PublicationIssueMappingRow) => {
    const externalEditionId = getRowExternalEditionId(row);
    const issueNumberOptions =
      externalEditionId === null
        ? []
        : (issueNumberCandidatesByEditionId[externalEditionId] ?? []).map(toIssueNumberOption);

    return (
      <Combobox
        contentClassName="w-[min(30rem,max(26rem,var(--radix-popover-trigger-width)))]"
        disabled={externalEditionId === null}
        excludedValues={getExcludedIssueNumberIds(row.rowId)}
        initialOptions={issueNumberOptions}
        messages={{
          clear: t("clearSelection"),
          empty: t("emptyIssueNumberCandidates"),
          searching: t("searchPending"),
          searchPlaceholder: t("issueNumberSearchPlaceholder"),
        }}
        normalizedClientFilter
        onSearch={async (query) => {
          if (externalEditionId === null) {
            return [];
          }

          const candidates = await loadIssueNumberOptions({
            externalEditionId,
            query,
          });

          return candidates.map(toIssueNumberOption);
        }}
        onSelect={(option) => {
          setRows((currentRows) =>
            currentRows.map((currentRow) => {
              if (currentRow.rowId === row.rowId) {
                return {
                  ...currentRow,
                  draftIssueSelection: option
                    ? {
                        externalIssueId: option.value,
                        externalIssueNumber: option.label,
                      }
                    : null,
                };
              }

              return option ? { ...currentRow, draftIssueSelection: null } : currentRow;
            }),
          );
        }}
        placeholder={t("issueNumberComboboxPlaceholder")}
        selectedOption={
          row.draftIssueSelection
            ? {
                value: row.draftIssueSelection.externalIssueId,
                label: row.draftIssueSelection.externalIssueNumber,
              }
            : null
        }
        widthClassName="min-w-[12rem]"
      />
    );
  };

  return (
    <>
      {isAllocationExpanded ? (
        <TableRow>
          <TableCell>
            <ParsedValueTooltip
              label={selectedItem.publicationName}
              locale={locale}
              publicationIssueId={selectedItem.publicationIssueId}
              occurrences={selectedItem.documentOccurrences}
              occurrenceCount={selectedItem.documentOccurrenceCount}
            />
          </TableCell>
          <TableCell>
            <ParsedValueTooltip
              label={selectedItem.parsedIssueNumber}
              locale={locale}
              publicationIssueId={selectedItem.publicationIssueId}
              occurrences={selectedItem.documentOccurrences}
              occurrenceCount={selectedItem.documentOccurrenceCount}
            />
          </TableCell>
          <TableCell className="muted" colSpan={2}>
            {t("allocationMode")}
          </TableCell>
          <TableCell className="text-center">
            <Button
              aria-label={t("collapseAllocation")}
              onClick={() => setIsAllocationExpanded(false)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ChevronUp className="size-4" />
            </Button>
          </TableCell>
        </TableRow>
      ) : (
        rows.map((row, index) => (
          <TableRow key={row.rowId}>
            <TableCell>
              {index === 0 ? (
                <ParsedValueTooltip
                  label={selectedItem.publicationName}
                  locale={locale}
                  publicationIssueId={selectedItem.publicationIssueId}
                  occurrences={selectedItem.documentOccurrences}
                  occurrenceCount={selectedItem.documentOccurrenceCount}
                />
              ) : null}
            </TableCell>
            <TableCell>
              {index === 0 ? (
                <ParsedValueTooltip
                  label={selectedItem.parsedIssueNumber}
                  locale={locale}
                  publicationIssueId={selectedItem.publicationIssueId}
                  occurrences={selectedItem.documentOccurrences}
                  occurrenceCount={selectedItem.documentOccurrenceCount}
                />
              ) : null}
            </TableCell>
            <TableCell>{renderPublicationCell(row)}</TableCell>
            <TableCell>{renderIssueNumberCell(row)}</TableCell>
            <TableCell className="w-[7.5rem] text-center align-middle">
              {index === 0 ? (
                <div className="flex justify-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("addRow")}
                          onClick={handleAddRow}
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>{t("addRow")}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : row.kind === "draft" ? (
                <div className="flex justify-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("removeRow")}
                          onClick={() => removeDraftRow(row.rowId)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>{t("removeRow")}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : (
                <span />
              )}
            </TableCell>
          </TableRow>
        ))
      )}
      {serverMessage ? (
        <TableRow>
          <TableCell colSpan={5}>
            <p className="text-sm text-[color:var(--accent-strong)]">{serverMessage}</p>
          </TableCell>
        </TableRow>
      ) : null}
      {isAllocationExpanded && documentId ? (
        <TableRow>
          <TableCell colSpan={5}>
            <DocumentLineAllocationsClient
              documentId={documentId}
              lines={allocationLines}
              locale={locale}
              saveLabel={allocationSaveLabel}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
});

function ParsedValueTooltip({
  label,
  locale,
  publicationIssueId,
  occurrences,
  occurrenceCount,
}: {
  label: string;
  locale: AppLocale;
  publicationIssueId: number;
  occurrences: PublicationIssueDocumentOccurrence[];
  occurrenceCount: number;
}) {
  const t = useTranslations("PublicationMappings");
  const [isLoadingAll, startLoadingAllTransition] = useTransition();
  const [allOccurrences, setAllOccurrences] = useState(occurrences);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const hiddenOccurrenceCount = Math.max(occurrenceCount - allOccurrences.length, 0);

  useEffect(() => {
    setAllOccurrences(occurrences);
    setLoadErrorKey(null);
  }, [occurrences]);

  const handleLoadAll = () => {
    startLoadingAllTransition(async () => {
      setLoadErrorKey(null);

      const result = await loadPublicationIssueOccurrences({
        locale,
        publicationIssueId,
      });

      if (result.errorKey) {
        setLoadErrorKey(result.errorKey);
        return;
      }

      setAllOccurrences(result.occurrences);
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="max-w-full cursor-help text-left underline decoration-dotted underline-offset-3"
            type="button"
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-h-80 w-[min(32rem,calc(100vw-2rem))] overflow-y-auto p-3">
          <div className="grid gap-3">
            <div className="grid gap-1">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-soft)]">
                {t("tooltip.title")}
              </span>
              <span className="text-sm">{label}</span>
            </div>
            <div className="grid gap-2">
              {allOccurrences.map((occurrence, index) => (
                <div
                  className="grid gap-1 rounded-[12px] border border-[color:var(--line)] bg-[color:var(--panel)] px-3 py-2"
                  key={`${occurrence.sourceFileName}-${occurrence.documentNumber ?? "no-doc"}-${index}`}
                >
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-soft)]">
                    {t("tooltip.documentNumberLabel")}
                  </span>
                  <span className="text-sm font-medium">
                    {getOccurrenceDocumentLabel(occurrence)}
                  </span>
                  <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-soft)]">
                    {t("tooltip.rawDataLabel")}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-sm">
                    {getOccurrenceRawText(occurrence)}
                  </span>
                </div>
              ))}
              {hiddenOccurrenceCount > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-[color:var(--ink-soft)]">
                    {t("tooltip.occurrenceSummary", {
                      shown: allOccurrences.length,
                      total: occurrenceCount,
                    })}
                  </span>
                  <Button
                    className="h-7"
                    disabled={isLoadingAll}
                    onClick={handleLoadAll}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isLoadingAll ? t("tooltip.loadMorePending") : t("tooltip.loadMore")}
                  </Button>
                </div>
              ) : null}
              {loadErrorKey ? (
                <span className="text-xs text-[color:var(--accent-strong)]">
                  {t(`messages.${loadErrorKey}`)}
                </span>
              ) : null}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LockedValueCell({
  label,
  onRemove,
  removeLabel,
}: {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-3 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-3 py-2">
      <span>{label}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={removeLabel}
              onClick={onRemove}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>{removeLabel}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
