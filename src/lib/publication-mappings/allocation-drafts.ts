import { z } from "zod";
import { unitPriceSchema } from "./price";
import { quantitySchema } from "./quantity";

export type AllocationDraft = {
  rowId: string;
  externalEditionId: number | null;
  externalEditionName: string;
  externalIssueId: number | null;
  externalIssueNumber: string;
  quantity: string;
  unitPrice: string;
};

export const allocationDraftsSchema = (
  incompleteMessage: string,
  priceMessage = incompleteMessage,
  quantityMessage = incompleteMessage,
) =>
  z
    .array(
      z.object({
        specialDocumentId: z.number().int().positive(),
        drafts: z
          .array(
            z.object({
              externalEditionId: z.number().int().positive().nullable(),
              externalEditionName: z.string(),
              externalIssueId: z.number().int().positive().nullable(),
              externalIssueNumber: z.string(),
              quantity: quantitySchema(quantityMessage),
              unitPrice: unitPriceSchema(priceMessage),
            }),
          )
          .refine(
            (drafts) =>
              // A single cleared row explicitly removes a mapping. A blank row in a split
              // allocation must be completed or removed, rather than silently discarded.
              (drafts.length === 1 &&
                drafts[0].externalEditionId === null &&
                drafts[0].externalIssueId === null) ||
              drafts.every(
                (draft) => draft.externalEditionId !== null && draft.externalIssueId !== null,
              ),
            incompleteMessage,
          ),
      }),
    )
    .transform((lines) =>
      lines.map(({ specialDocumentId, drafts }) => ({
        specialDocumentId,
        matchDetails: drafts.flatMap((draft) => {
          if (draft.externalEditionId === null || draft.externalIssueId === null) {
            return [];
          }
          return [
            {
              ...draft,
              externalEditionId: draft.externalEditionId,
              externalIssueId: draft.externalIssueId,
            },
          ];
        }),
      })),
    );

export const getExcludedAllocationIssueIds = (
  drafts: AllocationDraft[],
  rowId: string,
  editionId: number | null,
): Set<number> =>
  new Set(
    drafts.flatMap((draft) =>
      draft.rowId !== rowId &&
      draft.externalEditionId === editionId &&
      draft.externalIssueId !== null
        ? [draft.externalIssueId]
        : [],
    ),
  );
