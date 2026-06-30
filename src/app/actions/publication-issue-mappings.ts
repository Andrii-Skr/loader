"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type AppLocale, routing } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { getPublicationIssueOccurrences } from "@/lib/publication-mappings/queries";
import {
  replacePublicationMappings,
  searchIssueNumberCandidates,
  searchPublicationCandidates,
} from "@/lib/publication-mappings/service";
import type {
  IssueNumberCandidateDto,
  PublicationCandidateDto,
  PublicationIssueDocumentOccurrence,
  SavePublicationIssueMappingRegistryInput,
} from "@/lib/publication-mappings/types";
import { type AppActionSchema, appAction } from "@/utils/appAction";

const searchCandidatesSchema = z.object({
  publicationIssueId: z.number().int().positive(),
  locale: z.string(),
  query: z.string().max(160).optional(),
});

const loadOccurrencesSchema = z.object({
  publicationIssueId: z.number().int().positive(),
  locale: z.string(),
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
  issueConfirmations: z.array(
    z.object({
      publicationIssueId: z.number().int().positive(),
      hasConfirmedIssue: z.boolean(),
    }),
  ),
});

type SharedErrorKey = "missingSession" | "forbidden" | "invalidInput";

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

const isValidLocale = (locale: string): locale is AppLocale =>
  routing.locales.includes(locale as AppLocale);

const withAdminAction = <TInput, TParsed, TResult extends { errorKey: SharedErrorKey | null }>(
  handler: (input: TParsed) => Promise<TResult>,
  options: {
    schema: AppActionSchema<TInput, TParsed>;
    onInvalidInput: () => TResult;
  },
) =>
  appAction<TInput, TParsed, TResult>(handler, {
    ...options,
    requireAuth: true,
    roles: ["ADMIN"],
    onUnauthorized: () =>
      ({
        errorKey: "missingSession",
      }) as TResult,
    onForbidden: () =>
      ({
        errorKey: "forbidden",
      }) as TResult,
  });

export const searchPublicationMappingCandidates = async (
  input: z.input<typeof searchCandidatesSchema>,
): Promise<SearchPublicationCandidatesResult> =>
  withAdminAction<
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
  withAdminAction<
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
  withAdminAction<
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

      await Promise.all(
        parsedInput.publicationSelections.map((selection) =>
          replacePublicationMappings({
            publicationId: selection.publicationId,
            selections: selection.selectionIds.map((externalEditionId) => ({
              externalEditionId,
            })),
          }),
        ),
      );

      if (parsedInput.documentId) {
        await Promise.all(
          parsedInput.issueConfirmations.map((confirmation) =>
            prisma.specialDocument.updateMany({
              where: {
                documentId: parsedInput.documentId,
                publicationIssueId: confirmation.publicationIssueId,
              },
              data: {
                publicationIssueConfirmedAt: confirmation.hasConfirmedIssue ? new Date() : null,
              },
            }),
          ),
        );
      }

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
  withAdminAction<
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
