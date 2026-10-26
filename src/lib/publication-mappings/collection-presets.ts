import { z } from "zod";

import type { AllocationDraft } from "./allocation-drafts";
import { pickInitialIssueCandidate } from "./editor";
import { formatUnitPrice } from "./price";
import type { CollectionPresetDto, DocumentLineAllocationDto } from "./types";

export const normalizeCollectionKey = (value: string) =>
  value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("uk-UA");

export const collectionPresetNameSchema = (message: string) =>
  z.object({ name: z.string().trim().min(1, message).max(160, message) });

export const createCollectionDrafts = (
  line: DocumentLineAllocationDto,
  preset: CollectionPresetDto,
  prefix: string,
): AllocationDraft[] => {
  if (preset.unavailable || line.allocations.length > 0) return [];
  return preset.editions.map((edition, index) => {
    const issue = pickInitialIssueCandidate(
      line.presetIssueCandidates?.[edition.externalEditionId] ?? [],
    );
    return {
      rowId: `${prefix}-${line.specialDocumentId}-${index}`,
      ...edition,
      externalIssueId: issue?.externalIssueId ?? null,
      externalIssueNumber: issue?.externalIssueNumber ?? "",
      quantity: "",
      unitPrice: formatUnitPrice(line.unitPrice),
    };
  });
};
