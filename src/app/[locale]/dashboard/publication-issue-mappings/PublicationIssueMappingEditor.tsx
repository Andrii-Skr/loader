"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
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
} from "@/lib/publication-mappings/editor";
import type {
  IssueNumberCandidateDto,
  LoadPublicationIssueEditorData,
  PublicationCandidateDto,
  PublicationIssueMappingRow,
  PublicationIssueRegistryItem,
} from "@/lib/publication-mappings/types";

export type PublicationIssueMappingEditorHandle = {
  getSelections: () => {
    publicationId: number;
    issueNumberId: number;
    publicationSelectionIds: number[];
    issueSelectionIds: number[];
  };
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

const pickInitialPublicationCandidate = (candidates: PublicationCandidateDto[]) => {
  const exactCandidate = candidates.find((candidate) => candidate.isExactMatch);

  if (exactCandidate) {
    return exactCandidate;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const [firstCandidate, secondCandidate] = candidates;

  if (!firstCandidate) {
    return null;
  }

  if ((firstCandidate.score ?? 0) >= 0.92 && (secondCandidate?.score ?? 0) < firstCandidate.score) {
    return firstCandidate;
  }

  return null;
};

const pickInitialIssueCandidate = (candidates: IssueNumberCandidateDto[]) =>
  candidates.find((candidate) => candidate.isExactMatch) ?? null;

const buildInitialRows = ({
  issueNumberCandidates,
  publicationCandidates,
  selectedItem,
}: {
  issueNumberCandidates: IssueNumberCandidateDto[];
  publicationCandidates: PublicationCandidateDto[];
  selectedItem: PublicationIssueRegistryItem;
}): PublicationIssueMappingRow[] => {
  const initialPublicationCandidate = pickInitialPublicationCandidate(publicationCandidates);
  const initialIssueNumberCandidate = pickInitialIssueCandidate(issueNumberCandidates);
  const savedRows = buildSavedMappingRows({
    parsedPublicationName: selectedItem.publicationName,
    parsedIssueNumber: selectedItem.canonicalIssueNumber,
    publicationMappings: selectedItem.publicationMappings,
    issueNumberMappings: selectedItem.issueNumberMappings,
  });

  if (savedRows.length === 0) {
    return [
      {
        ...createDraftMappingRow({
          parsedPublicationName: selectedItem.publicationName,
          parsedIssueNumber: selectedItem.canonicalIssueNumber,
          rowId: `base-${selectedItem.publicationIssueId}`,
        }),
        draftPublicationSelection: initialPublicationCandidate
          ? {
              externalEditionId: initialPublicationCandidate.externalEditionId,
              externalEditionName: initialPublicationCandidate.externalEditionName,
            }
          : null,
        draftIssueSelection: initialIssueNumberCandidate
          ? {
              externalIssueId: initialIssueNumberCandidate.externalIssueId,
              externalIssueNumber: initialIssueNumberCandidate.externalIssueNumber,
            }
          : null,
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
      row.savedIssueNumberMapping === null && initialIssueNumberCandidate
        ? {
            externalIssueId: initialIssueNumberCandidate.externalIssueId,
            externalIssueNumber: initialIssueNumberCandidate.externalIssueNumber,
          }
        : null,
  }));
};

export const PublicationIssueMappingEditor = forwardRef<
  PublicationIssueMappingEditorHandle,
  {
    editorData: LoadPublicationIssueEditorData;
    locale: AppLocale;
    selectedItem: PublicationIssueRegistryItem;
  }
>(function PublicationIssueMappingEditor({ editorData, locale, selectedItem }, ref) {
  const t = useTranslations("PublicationMappings");
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const draftRowCounterRef = useRef(0);
  const [rows, setRows] = useState<PublicationIssueMappingRow[]>(() =>
    buildInitialRows({
      issueNumberCandidates: editorData.issueNumberCandidates,
      publicationCandidates: editorData.publicationCandidates,
      selectedItem,
    }),
  );

  const publicationOptions = useMemo(
    () => editorData.publicationCandidates.map(toPublicationOption),
    [editorData.publicationCandidates],
  );
  const issueNumberOptions = useMemo(
    () => editorData.issueNumberCandidates.map(toIssueNumberOption),
    [editorData.issueNumberCandidates],
  );

  useEffect(() => {
    draftRowCounterRef.current = 0;
    setRows(
      buildInitialRows({
        issueNumberCandidates: editorData.issueNumberCandidates,
        publicationCandidates: editorData.publicationCandidates,
        selectedItem,
      }),
    );
    setServerMessage(null);
  }, [editorData.issueNumberCandidates, editorData.publicationCandidates, selectedItem]);

  const updateRow = (
    rowId: string,
    updater: (row: PublicationIssueMappingRow) => PublicationIssueMappingRow,
  ) => {
    setRows((currentRows) => currentRows.map((row) => (row.rowId === rowId ? updater(row) : row)));
  };

  const appendDraftRow = () => {
    draftRowCounterRef.current += 1;
    setRows((currentRows) => [
      ...currentRows,
      createDraftMappingRow({
        parsedPublicationName: selectedItem.publicationName,
        parsedIssueNumber: selectedItem.canonicalIssueNumber,
        rowId: `draft-${selectedItem.publicationIssueId}-${draftRowCounterRef.current}`,
      }),
    ]);
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

        return [
          row.savedIssueNumberMapping?.externalIssueId,
          row.draftIssueSelection?.externalIssueId,
        ].filter((value): value is number => Number.isInteger(value));
      }),
    );

  useImperativeHandle(
    ref,
    () => ({
      getSelections: () => {
        const { issueSelectionIds, publicationSelectionIds } = collectSelectionIdsFromRows(rows);

        return {
          publicationId: selectedItem.publicationId,
          issueNumberId: selectedItem.issueNumberId,
          publicationSelectionIds,
          issueSelectionIds,
        };
      },
    }),
    [rows, selectedItem.issueNumberId, selectedItem.publicationId],
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
        onSelect={(option) => {
          updateRow(row.rowId, (currentRow) => ({
            ...currentRow,
            draftPublicationSelection: option
              ? {
                  externalEditionId: option.value,
                  externalEditionName: option.label,
                }
              : null,
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
    if (row.savedIssueNumberMapping) {
      return (
        <LockedValueCell
          label={row.savedIssueNumberMapping.externalIssueNumber}
          onRemove={() =>
            updateRow(row.rowId, (currentRow) => ({
              ...currentRow,
              savedIssueNumberMapping: null,
            }))
          }
          removeLabel={t("removeIssueNumber")}
        />
      );
    }

    return (
      <Combobox
        contentClassName="w-[min(30rem,max(26rem,var(--radix-popover-trigger-width)))]"
        excludedValues={getExcludedIssueNumberIds(row.rowId)}
        initialOptions={issueNumberOptions}
        messages={{
          clear: t("clearSelection"),
          empty: t("emptyIssueNumberCandidates"),
          searching: t("searchPending"),
          searchPlaceholder: t("issueNumberSearchPlaceholder"),
        }}
        onSearch={async (query) => {
          const result = await searchIssueNumberMappingCandidates({
            publicationIssueId: selectedItem.publicationIssueId,
            locale,
            query,
          });

          if (result.errorKey) {
            setServerMessage(t(`messages.${result.errorKey}`));
            return [];
          }

          return result.candidates.map(toIssueNumberOption);
        }}
        onSelect={(option) => {
          updateRow(row.rowId, (currentRow) => ({
            ...currentRow,
            draftIssueSelection: option
              ? {
                  externalIssueId: option.value,
                  externalIssueNumber: option.label,
                }
              : null,
          }));
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
      {rows.map((row, index) => (
        <TableRow key={row.rowId}>
          <TableCell>{index === 0 ? selectedItem.publicationName : null}</TableCell>
          <TableCell>{index === 0 ? selectedItem.canonicalIssueNumber : null}</TableCell>
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
                        onClick={appendDraftRow}
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
                <Button
                  aria-label={t("removeRow")}
                  onClick={() => removeDraftRow(row.rowId)}
                  size="icon-sm"
                  title={t("removeRow")}
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ) : (
              <span />
            )}
          </TableCell>
        </TableRow>
      ))}
      {serverMessage ? (
        <TableRow>
          <TableCell colSpan={5}>
            <p className="text-sm text-[color:var(--accent-strong)]">{serverMessage}</p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
});

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
      <Button
        aria-label={removeLabel}
        onClick={onRemove}
        size="icon-xs"
        title={removeLabel}
        type="button"
        variant="ghost"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
