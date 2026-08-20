"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { type AppLocale, routing } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import {
  getExternalIssuePairsByIds,
  searchExternalEditions,
  searchExternalIssueNumbersByEdition,
} from "@/lib/publication-mappings/external-repository";
import { getPublicationIssueOccurrences } from "@/lib/publication-mappings/queries";
import {
  applyPublicationMappingReplacements,
  preparePublicationMappingReplacement,
  searchIssueNumberCandidates,
  searchPublicationCandidates,
} from "@/lib/publication-mappings/service";
import type {
  DocumentExternalMatchDetailDto,
  DocumentIssueMatchDto,
  IssueNumberCandidateDto,
  PublicationCandidateDto,
  PublicationIssueDocumentOccurrence,
  SaveDocumentLineAllocationsInput,
  SavePublicationIssueMappingRegistryInput,
} from "@/lib/publication-mappings/types";
import { type AppActionSchema, appAction } from "@/utils/appAction";

const searchCandidatesSchema = z.object({
  publicationIssueId: z.number().int().positive(),
  locale: z.string(),
  externalEditionId: z.number().int().positive().optional(),
  query: z.string().max(160).optional(),
});

const loadOccurrencesSchema = z.object({
  publicationIssueId: z.number().int().positive(),
  locale: z.string(),
});

const searchExternalEditionsSchema = z.object({
  locale: z.string(),
  query: z.string().max(160).optional(),
});

const searchExternalIssuesSchema = z.object({
  locale: z.string(),
  externalEditionId: z.number().int().positive(),
  query: z.string().max(160).optional(),
});

const saveDocumentLineAllocationsSchema: z.ZodType<SaveDocumentLineAllocationsInput> = z.object({
  locale: z.string(),
  documentId: z.number().int().positive(),
  allocations: z.array(
    z.object({
      specialDocumentId: z.number().int().positive(),
      matchDetails: z.array(
        z.object({
          externalEditionId: z.number().int().positive(),
          externalEditionName: z.string().min(1).max(260),
          externalIssueId: z.number().int().positive(),
          externalIssueNumber: z.string().min(1).max(160),
          quantity: z.string().min(1).max(40),
          unitPrice: z.string().min(1).max(40),
        }),
      ),
    }),
  ),
});

const saveRegistrySchema: z.ZodType<SavePublicationIssueMappingRegistryInput> = z.object({
  locale: z.string(),
  documentId: z.number().int().positive().optional(),
  publicationSelections: z.array(
    z.object({
      publicationId: z.number().int().positive(),
      selectionIds: z.array(z.number().int().positive()),
    }),
  ),
  issueMatches: z.array(
    z.object({
      publicationIssueId: z.number().int().positive(),
      matchedIssue: z
        .object({
          externalEditionId: z.number().int().positive(),
          externalEditionName: z.string().min(1).max(260),
          externalIssueId: z.number().int().positive(),
          externalIssueNumber: z.string().min(1).max(160),
        })
        .nullable(),
      matchDetails: z
        .array(
          z.object({
            externalEditionId: z.number().int().positive(),
            externalEditionName: z.string().min(1).max(260),
            externalIssueId: z.number().int().positive().nullable(),
            externalIssueNumber: z.string().min(1).max(160).nullable(),
            quantity: z.string().min(1).max(40),
            unitPrice: z.string().min(1).max(40).nullable(),
            lineBaseAmount: z.string().min(1).max(40).nullable(),
            lineVatAmount: z.string().min(1).max(40).nullable(),
            lineTotalAmount: z.string().min(1).max(40).nullable(),
            currency: z.string().min(1).max(12),
            isPrimary: z.boolean(),
          }),
        )
        .optional(),
    }),
  ),
});

type SharedErrorKey = "missingSession" | "forbidden" | "invalidInput" | "validationFailed";

export type SearchPublicationCandidatesResult = {
  errorKey: SharedErrorKey | null;
  candidates: PublicationCandidateDto[];
};

export type SearchIssueNumberCandidatesResult = {
  errorKey: SharedErrorKey | null;
  candidates: IssueNumberCandidateDto[];
};

export type SavePublicationIssueMappingRegistryResult = {
  errorKey: SharedErrorKey | null;
};

export type LoadPublicationIssueOccurrencesResult = {
  errorKey: SharedErrorKey | null;
  occurrences: PublicationIssueDocumentOccurrence[];
};

export type SearchExternalEditionsResult = {
  errorKey: SharedErrorKey | null;
  candidates: Array<{ externalEditionId: number; externalEditionName: string }>;
};

export type SearchExternalIssuesResult = {
  errorKey: SharedErrorKey | null;
  candidates: Array<{ externalIssueId: number; externalIssueNumber: string }>;
};

const isValidLocale = (locale: string): locale is AppLocale =>
  routing.locales.includes(locale as AppLocale);

const toDecimal = (value: string | Prisma.Decimal | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
};

const buildSingleDetailFromRow = ({
  matchedIssue,
  row,
}: {
  matchedIssue: DocumentIssueMatchDto;
  row: {
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    lineBaseAmount: Prisma.Decimal;
    lineVatAmount: Prisma.Decimal;
    lineTotalAmount: Prisma.Decimal | null;
    currency: string;
  };
}): DocumentExternalMatchDetailDto => ({
  externalEditionId: matchedIssue.externalEditionId,
  externalEditionName: matchedIssue.externalEditionName ?? "",
  externalIssueId: matchedIssue.externalIssueId,
  externalIssueNumber: matchedIssue.externalIssueNumber,
  quantity: row.quantity.toString(),
  unitPrice: row.unitPrice.toString(),
  lineBaseAmount: row.lineBaseAmount.toString(),
  lineVatAmount: row.lineVatAmount.toString(),
  lineTotalAmount: row.lineTotalAmount?.toString() ?? null,
  currency: row.currency,
  isPrimary: true,
});

const validateDetailTotalsAgainstRow = ({
  details,
  row,
}: {
  details: DocumentExternalMatchDetailDto[];
  row: {
    quantity: Prisma.Decimal;
    lineBaseAmount: Prisma.Decimal;
    lineVatAmount: Prisma.Decimal;
    lineTotalAmount: Prisma.Decimal | null;
  };
}) => {
  const hasInvalidAmount = details.some((detail) =>
    [
      detail.quantity,
      detail.unitPrice,
      detail.lineBaseAmount,
      detail.lineVatAmount,
      detail.lineTotalAmount,
    ].some(
      (value) => value !== null && (toDecimal(value) === null || !toDecimal(value)?.isFinite()),
    ),
  );

  if (hasInvalidAmount) {
    return false;
  }

  const detailQuantity = details.reduce(
    (sum, detail) => sum.plus(toDecimal(detail.quantity) ?? 0),
    new Prisma.Decimal(0),
  );
  const detailBaseAmount = details.reduce(
    (sum, detail) => sum.plus(toDecimal(detail.lineBaseAmount) ?? 0),
    new Prisma.Decimal(0),
  );
  const detailVatAmount = details.reduce(
    (sum, detail) => sum.plus(toDecimal(detail.lineVatAmount) ?? 0),
    new Prisma.Decimal(0),
  );
  const detailTotalAmount = details.reduce(
    (sum, detail) => sum.plus(toDecimal(detail.lineTotalAmount) ?? 0),
    new Prisma.Decimal(0),
  );

  return (
    detailQuantity.equals(row.quantity) &&
    detailBaseAmount.equals(row.lineBaseAmount) &&
    detailVatAmount.equals(row.lineVatAmount) &&
    detailTotalAmount.equals(row.lineTotalAmount ?? new Prisma.Decimal(0))
  );
};

const pickPrimaryDetail = (details: DocumentExternalMatchDetailDto[]) =>
  details.find((detail) => detail.isPrimary) ?? details[0] ?? null;

const getVatRatePercent = (vatRate: string | null) => {
  const match = vatRate?.replace(",", ".").match(/\d+(?:\.\d+)?/u);
  return match ? new Prisma.Decimal(match[0]) : new Prisma.Decimal(0);
};

const toRoundedMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2);

const externalIssuePairKey = ({
  externalEditionId,
  externalIssueId,
}: {
  externalEditionId: number;
  externalIssueId: number;
}) => `${externalEditionId}:${externalIssueId}`;

const getCanonicalExternalIssuePairs = async (
  pairs: Array<{ externalEditionId: number; externalIssueId: number }>,
) => {
  const canonicalPairs = await getExternalIssuePairsByIds(pairs);
  const pairsByKey = new Map(
    canonicalPairs.map((pair) => [externalIssuePairKey(pair), pair] as const),
  );

  return pairs.every((pair) => pairsByKey.has(externalIssuePairKey(pair))) ? pairsByKey : null;
};

const withAuthenticatedAction = <
  TInput,
  TParsed,
  TResult extends { errorKey: SharedErrorKey | null },
>(
  handler: (input: TParsed) => Promise<TResult>,
  options: {
    schema: AppActionSchema<TInput, TParsed>;
    onInvalidInput: () => TResult;
  },
) =>
  appAction<TInput, TParsed, TResult>(handler, {
    ...options,
    requireAuth: true,
    onUnauthorized: () =>
      ({
        errorKey: "missingSession",
      }) as TResult,
  });

export const searchPublicationMappingCandidates = async (
  input: z.input<typeof searchCandidatesSchema>,
): Promise<SearchPublicationCandidatesResult> =>
  withAuthenticatedAction<
    z.input<typeof searchCandidatesSchema>,
    z.infer<typeof searchCandidatesSchema>,
    SearchPublicationCandidatesResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return {
          errorKey: "invalidInput",
          candidates: [],
        };
      }

      return {
        errorKey: null,
        candidates: await searchPublicationCandidates({
          publicationIssueId: parsedInput.publicationIssueId,
          query: parsedInput.query,
        }),
      };
    },
    {
      schema: searchCandidatesSchema,
      onInvalidInput: () => ({
        errorKey: "invalidInput",
        candidates: [],
      }),
    },
  )(input);

export const searchIssueNumberMappingCandidates = async (
  input: z.input<typeof searchCandidatesSchema>,
): Promise<SearchIssueNumberCandidatesResult> =>
  withAuthenticatedAction<
    z.input<typeof searchCandidatesSchema>,
    z.infer<typeof searchCandidatesSchema>,
    SearchIssueNumberCandidatesResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return {
          errorKey: "invalidInput",
          candidates: [],
        };
      }

      return {
        errorKey: null,
        candidates: await searchIssueNumberCandidates({
          publicationIssueId: parsedInput.publicationIssueId,
          externalEditionId: parsedInput.externalEditionId,
          query: parsedInput.query,
        }),
      };
    },
    {
      schema: searchCandidatesSchema,
      onInvalidInput: () => ({
        errorKey: "invalidInput",
        candidates: [],
      }),
    },
  )(input);

export const savePublicationIssueMappingRegistry = async (
  input: z.input<typeof saveRegistrySchema>,
): Promise<SavePublicationIssueMappingRegistryResult> =>
  withAuthenticatedAction<
    z.input<typeof saveRegistrySchema>,
    z.infer<typeof saveRegistrySchema>,
    SavePublicationIssueMappingRegistryResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return {
          errorKey: "invalidInput",
        };
      }

      const issueMatchDetails = parsedInput.issueMatches.flatMap(
        (issueMatch) => issueMatch.matchDetails ?? [],
      );
      if (
        issueMatchDetails.some(
          (detail) => detail.externalIssueId === null || detail.externalIssueNumber === null,
        )
      ) {
        return { errorKey: "validationFailed" };
      }

      const issuePairs = parsedInput.issueMatches.flatMap((issueMatch) => [
        ...(issueMatch.matchedIssue ? [issueMatch.matchedIssue] : []),
        ...(issueMatch.matchDetails ?? []).map((detail) => ({
          externalEditionId: detail.externalEditionId,
          externalIssueId: detail.externalIssueId as number,
        })),
      ]);
      const [canonicalPairsByKey, preparedPublicationMappings] = await Promise.all([
        getCanonicalExternalIssuePairs(issuePairs),
        Promise.all(
          parsedInput.publicationSelections.map((selection) =>
            preparePublicationMappingReplacement({
              publicationId: selection.publicationId,
              selections: selection.selectionIds.map((externalEditionId) => ({
                externalEditionId,
              })),
            }),
          ),
        ),
      ]);
      if (!canonicalPairsByKey) {
        return { errorKey: "validationFailed" };
      }

      const canonicalIssueMatches = parsedInput.issueMatches.map((issueMatch) => {
        const matchedIssue = issueMatch.matchedIssue
          ? canonicalPairsByKey.get(externalIssuePairKey(issueMatch.matchedIssue))
          : null;
        const matchDetails = issueMatch.matchDetails?.map((detail) => {
          const canonicalPair = canonicalPairsByKey.get(
            externalIssuePairKey({
              externalEditionId: detail.externalEditionId,
              externalIssueId: detail.externalIssueId as number,
            }),
          );

          return {
            ...detail,
            externalEditionName: canonicalPair?.externalEditionName ?? detail.externalEditionName,
            externalIssueNumber: canonicalPair?.externalIssueNumber ?? detail.externalIssueNumber,
          };
        });

        return {
          ...issueMatch,
          matchedIssue: matchedIssue
            ? {
                externalEditionId: matchedIssue.externalEditionId,
                externalEditionName: matchedIssue.externalEditionName,
                externalIssueId: matchedIssue.externalIssueId,
                externalIssueNumber: matchedIssue.externalIssueNumber,
              }
            : null,
          matchDetails,
        };
      });

      const preparedIssueMatches = parsedInput.documentId
        ? await Promise.all(
            canonicalIssueMatches.map(async (issueMatch) => {
              const specialDocuments = await prisma.specialDocument.findMany({
                where: {
                  documentId: parsedInput.documentId,
                  publicationIssueId: issueMatch.publicationIssueId,
                },
                select: {
                  id: true,
                  quantity: true,
                  unitPrice: true,
                  lineBaseAmount: true,
                  lineVatAmount: true,
                  lineTotalAmount: true,
                  document: { select: { currency: true } },
                  _count: { select: { externalMatches: true } },
                },
              });
              const providedDetails = issueMatch.matchDetails ?? [];

              if (providedDetails.length > 0 && specialDocuments.length !== 1) {
                return { ok: false as const };
              }

              const detailPayloadByDocumentId = new Map<number, DocumentExternalMatchDetailDto[]>();

              if (providedDetails.length > 0) {
                const targetRow = specialDocuments[0];

                if (
                  !targetRow ||
                  !validateDetailTotalsAgainstRow({ details: providedDetails, row: targetRow })
                ) {
                  return { ok: false as const };
                }

                detailPayloadByDocumentId.set(targetRow.id, providedDetails);
              } else if (issueMatch.matchedIssue) {
                for (const row of specialDocuments) {
                  if (row._count.externalMatches > 0) {
                    continue;
                  }

                  detailPayloadByDocumentId.set(row.id, [
                    buildSingleDetailFromRow({
                      matchedIssue: issueMatch.matchedIssue,
                      row: { ...row, currency: row.document.currency },
                    }),
                  ]);
                }
              }

              try {
                const writes = Array.from(detailPayloadByDocumentId.entries()).flatMap(
                  ([specialDocumentId, details]) =>
                    details.map((detail) => ({
                      specialDocumentId,
                      externalEditionId: detail.externalEditionId,
                      externalEditionName: detail.externalEditionName,
                      externalIssueId: detail.externalIssueId,
                      externalIssueNumber: detail.externalIssueNumber,
                      quantity: new Prisma.Decimal(detail.quantity),
                      unitPrice: toDecimal(detail.unitPrice),
                      lineBaseAmount: toDecimal(detail.lineBaseAmount),
                      lineVatAmount: toDecimal(detail.lineVatAmount),
                      lineTotalAmount: toDecimal(detail.lineTotalAmount),
                      currency: detail.currency,
                      isPrimary: detail.isPrimary,
                    })),
                );
                return {
                  ok: true as const,
                  documentMatchSummaries: Array.from(detailPayloadByDocumentId.entries()).map(
                    ([specialDocumentId, documentDetails]) => ({
                      specialDocumentId,
                      primaryDetail: pickPrimaryDetail(documentDetails),
                      matchCount: documentDetails.length,
                    }),
                  ),
                  specialDocumentIds:
                    providedDetails.length > 0
                      ? specialDocuments.map((row) => row.id)
                      : specialDocuments
                          .filter((row) => row._count.externalMatches === 0)
                          .map((row) => row.id),
                  writes,
                };
              } catch {
                return { ok: false as const };
              }
            }),
          )
        : [];

      if (preparedIssueMatches.some((result) => result.ok === false)) {
        return { errorKey: "validationFailed" };
      }

      await prisma.$transaction(async (tx) => {
        await applyPublicationMappingReplacements({
          replacements: preparedPublicationMappings,
          tx,
        });

        for (const result of preparedIssueMatches) {
          if (!result.ok) {
            continue;
          }

          if (result.specialDocumentIds.length === 0) {
            continue;
          }

          await tx.specialDocumentExternalMatch.deleteMany({
            where: { specialDocumentId: { in: result.specialDocumentIds } },
          });

          if (result.writes.length > 0) {
            await tx.specialDocumentExternalMatch.createMany({ data: result.writes });
          }

          const summaryBySpecialDocumentId = new Map(
            result.documentMatchSummaries.map((summary) => [summary.specialDocumentId, summary]),
          );

          for (const specialDocumentId of result.specialDocumentIds) {
            const summary = summaryBySpecialDocumentId.get(specialDocumentId);
            const primaryDetail = summary?.primaryDetail ?? null;
            const matchCount = summary?.matchCount ?? 0;

            await tx.specialDocument.update({
              where: { id: specialDocumentId },
              data: {
                publicationIssueConfirmedAt: primaryDetail ? new Date() : null,
                matchedExternalEditionId: primaryDetail?.externalEditionId ?? null,
                matchedExternalIssueId: primaryDetail?.externalIssueId ?? null,
                matchedExternalIssueNumber: primaryDetail?.externalIssueNumber ?? null,
                hasMultipleExternalMatches: matchCount > 1,
                externalMatchCount: matchCount,
              },
            });
          }
        }
      });

      revalidatePath(`/${parsedInput.locale}/dashboard`, "layout");
      if (parsedInput.documentId) {
        revalidatePath(`/${parsedInput.locale}/dashboard/documents/${parsedInput.documentId}`);
        revalidatePath(
          `/${parsedInput.locale}/dashboard/publication-issue-mappings?filter=document-unmatched&documentId=${parsedInput.documentId}`,
        );
      }

      return {
        errorKey: null,
      };
    },
    {
      schema: saveRegistrySchema,
      onInvalidInput: () => ({
        errorKey: "invalidInput",
      }),
    },
  )(input);

export const loadPublicationIssueOccurrences = async (
  input: z.input<typeof loadOccurrencesSchema>,
): Promise<LoadPublicationIssueOccurrencesResult> =>
  withAuthenticatedAction<
    z.input<typeof loadOccurrencesSchema>,
    z.infer<typeof loadOccurrencesSchema>,
    LoadPublicationIssueOccurrencesResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return {
          errorKey: "invalidInput",
          occurrences: [],
        };
      }

      return {
        errorKey: null,
        occurrences: await getPublicationIssueOccurrences(parsedInput.publicationIssueId),
      };
    },
    {
      schema: loadOccurrencesSchema,
      onInvalidInput: () => ({
        errorKey: "invalidInput",
        occurrences: [],
      }),
    },
  )(input);

export const searchDocumentAllocationEditions = async (
  input: z.input<typeof searchExternalEditionsSchema>,
): Promise<SearchExternalEditionsResult> =>
  withAuthenticatedAction<
    z.input<typeof searchExternalEditionsSchema>,
    z.infer<typeof searchExternalEditionsSchema>,
    SearchExternalEditionsResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return { errorKey: "invalidInput", candidates: [] };
      }

      const candidates = await searchExternalEditions(parsedInput.query ?? "");
      return {
        errorKey: null,
        candidates: candidates.map((candidate) => ({
          externalEditionId: candidate.id,
          externalEditionName: candidate.name,
        })),
      };
    },
    {
      schema: searchExternalEditionsSchema,
      onInvalidInput: () => ({ errorKey: "invalidInput", candidates: [] }),
    },
  )(input);

export const searchDocumentAllocationIssues = async (
  input: z.input<typeof searchExternalIssuesSchema>,
): Promise<SearchExternalIssuesResult> =>
  withAuthenticatedAction<
    z.input<typeof searchExternalIssuesSchema>,
    z.infer<typeof searchExternalIssuesSchema>,
    SearchExternalIssuesResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return { errorKey: "invalidInput", candidates: [] };
      }

      const candidates = await searchExternalIssueNumbersByEdition({
        externalEditionId: parsedInput.externalEditionId,
        query: parsedInput.query,
      });
      return {
        errorKey: null,
        candidates: candidates.map((candidate) => ({
          externalIssueId: candidate.id,
          externalIssueNumber: candidate.number,
        })),
      };
    },
    {
      schema: searchExternalIssuesSchema,
      onInvalidInput: () => ({ errorKey: "invalidInput", candidates: [] }),
    },
  )(input);

export const saveDocumentLineAllocations = async (
  input: z.input<typeof saveDocumentLineAllocationsSchema>,
): Promise<SavePublicationIssueMappingRegistryResult> =>
  withAuthenticatedAction<
    z.input<typeof saveDocumentLineAllocationsSchema>,
    z.infer<typeof saveDocumentLineAllocationsSchema>,
    SavePublicationIssueMappingRegistryResult
  >(
    async (parsedInput) => {
      if (!isValidLocale(parsedInput.locale)) {
        return { errorKey: "invalidInput" };
      }

      const sourceIds = parsedInput.allocations.map((allocation) => allocation.specialDocumentId);
      if (new Set(sourceIds).size !== sourceIds.length) {
        return { errorKey: "validationFailed" };
      }

      const allocationPairs = parsedInput.allocations.flatMap((allocation) =>
        allocation.matchDetails.map(({ externalEditionId, externalIssueId }) => ({
          externalEditionId,
          externalIssueId,
        })),
      );
      const [rows, canonicalPairsByKey] = await Promise.all([
        prisma.specialDocument.findMany({
          where: { id: { in: sourceIds }, documentId: parsedInput.documentId },
          select: {
            id: true,
            quantity: true,
            vatRate: true,
            document: { select: { currency: true } },
          },
        }),
        getCanonicalExternalIssuePairs(allocationPairs),
      ]);
      if (rows.length !== parsedInput.allocations.length || !canonicalPairsByKey) {
        return { errorKey: "validationFailed" };
      }

      const rowsById = new Map(rows.map((row) => [row.id, row]));
      const payloads: Array<{
        specialDocumentId: number;
        details: Array<{
          externalEditionId: number;
          externalEditionName: string;
          externalIssueId: number;
          externalIssueNumber: string;
          quantity: Prisma.Decimal;
          unitPrice: Prisma.Decimal;
          lineBaseAmount: Prisma.Decimal;
          lineVatAmount: Prisma.Decimal;
          lineTotalAmount: Prisma.Decimal;
          currency: string;
          isPrimary: boolean;
        }>;
      }> = [];

      for (const allocation of parsedInput.allocations) {
        const row = rowsById.get(allocation.specialDocumentId);
        if (!row) {
          return { errorKey: "validationFailed" };
        }

        if (allocation.matchDetails.length === 0) {
          payloads.push({ specialDocumentId: allocation.specialDocumentId, details: [] });
          continue;
        }

        const targetKeys = new Set<string>();
        let allocatedQuantity = new Prisma.Decimal(0);
        const vatRate = getVatRatePercent(row.vatRate);
        const details = [];

        for (const [index, detail] of allocation.matchDetails.entries()) {
          let quantity: Prisma.Decimal;
          let unitPrice: Prisma.Decimal;
          try {
            quantity = new Prisma.Decimal(detail.quantity);
            unitPrice = new Prisma.Decimal(detail.unitPrice);
          } catch {
            return { errorKey: "validationFailed" };
          }
          const targetKey = `${detail.externalEditionId}:${detail.externalIssueId}`;
          const canonicalPair = canonicalPairsByKey.get(targetKey);
          if (
            !canonicalPair ||
            !quantity.isFinite() ||
            !unitPrice.isFinite() ||
            quantity.lte(0) ||
            unitPrice.lt(0) ||
            targetKeys.has(targetKey)
          ) {
            return { errorKey: "validationFailed" };
          }
          targetKeys.add(targetKey);
          allocatedQuantity = allocatedQuantity.plus(quantity);
          const lineBaseAmount = toRoundedMoney(quantity.mul(unitPrice));
          const lineVatAmount = toRoundedMoney(lineBaseAmount.mul(vatRate).div(100));
          details.push({
            ...detail,
            externalEditionName: canonicalPair.externalEditionName,
            externalIssueNumber: canonicalPair.externalIssueNumber,
            quantity,
            unitPrice,
            lineBaseAmount,
            lineVatAmount,
            lineTotalAmount: toRoundedMoney(lineBaseAmount.plus(lineVatAmount)),
            currency: row.document.currency,
            isPrimary: index === 0,
          });
        }

        if (!allocatedQuantity.equals(row.quantity)) {
          return { errorKey: "validationFailed" };
        }
        payloads.push({ specialDocumentId: allocation.specialDocumentId, details });
      }

      await prisma.$transaction(async (tx) => {
        for (const payload of payloads) {
          const primary = payload.details[0];
          await tx.specialDocumentExternalMatch.deleteMany({
            where: { specialDocumentId: payload.specialDocumentId },
          });
          if (payload.details.length > 0) {
            await tx.specialDocumentExternalMatch.createMany({
              data: payload.details.map((detail) => ({
                specialDocumentId: payload.specialDocumentId,
                ...detail,
              })),
            });
          }
          await tx.specialDocument.update({
            where: { id: payload.specialDocumentId },
            data: {
              publicationIssueConfirmedAt: primary ? new Date() : null,
              matchedExternalEditionId: primary?.externalEditionId ?? null,
              matchedExternalIssueId: primary?.externalIssueId ?? null,
              matchedExternalIssueNumber: primary?.externalIssueNumber ?? null,
              externalMatchCount: payload.details.length,
              hasMultipleExternalMatches: payload.details.length > 1,
            },
          });
        }
      });

      revalidatePath(`/${parsedInput.locale}/dashboard`, "layout");
      revalidatePath(`/${parsedInput.locale}/dashboard/documents/${parsedInput.documentId}`);
      revalidatePath(`/${parsedInput.locale}/dashboard/publication-issue-mappings`);
      return { errorKey: null };
    },
    {
      schema: saveDocumentLineAllocationsSchema,
      onInvalidInput: () => ({ errorKey: "invalidInput" }),
    },
  )(input);
