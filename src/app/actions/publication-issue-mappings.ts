"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { type AppLocale, routing } from "@/i18n/routing";
import {
  replaceIssueNumberMappings,
  replacePublicationMappings,
  searchIssueNumberCandidates,
  searchPublicationCandidates,
} from "@/lib/publication-mappings/service";
import type {
  IssueNumberCandidateDto,
  PublicationCandidateDto,
  SavePublicationIssueMappingRegistryInput,
} from "@/lib/publication-mappings/types";

const searchCandidatesSchema = z.object({
  publicationIssueId: z.number().int().positive(),
  locale: z.string(),
  query: z.string().max(160).optional(),
});

const saveRegistrySchema: z.ZodType<SavePublicationIssueMappingRegistryInput> = z.object({
  locale: z.string(),
  publicationSelections: z.array(
    z.object({
      publicationId: z.number().int().positive(),
      selectionIds: z.array(z.number().int().positive()),
    }),
  ),
  issueSelections: z.array(
    z.object({
      issueNumberId: z.number().int().positive(),
      selectionIds: z.array(z.number().int().positive()),
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

const canManageMappings = async () => {
  const session = await auth();

  if (!session?.user?.id) {
    return { errorKey: "missingSession" as SharedErrorKey };
  }

  if (session.user.role !== "ADMIN") {
    return { errorKey: "forbidden" as SharedErrorKey };
  }

  return { errorKey: null as SharedErrorKey | null };
};

const isValidLocale = (locale: string): locale is AppLocale =>
  routing.locales.includes(locale as AppLocale);

export const searchPublicationMappingCandidates = async (
  input: z.input<typeof searchCandidatesSchema>,
): Promise<SearchPublicationCandidatesResult> => {
  const permission = await canManageMappings();

  if (permission.errorKey) {
    return {
      errorKey: permission.errorKey,
      candidates: [],
    };
  }

  const parsed = searchCandidatesSchema.safeParse(input);

  if (!parsed.success || !isValidLocale(parsed.data.locale)) {
    return {
      errorKey: "invalidInput",
      candidates: [],
    };
  }

  return {
    errorKey: null,
    candidates: await searchPublicationCandidates({
      publicationIssueId: parsed.data.publicationIssueId,
      query: parsed.data.query,
    }),
  };
};

export const searchIssueNumberMappingCandidates = async (
  input: z.input<typeof searchCandidatesSchema>,
): Promise<SearchIssueNumberCandidatesResult> => {
  const permission = await canManageMappings();

  if (permission.errorKey) {
    return {
      errorKey: permission.errorKey,
      candidates: [],
    };
  }

  const parsed = searchCandidatesSchema.safeParse(input);

  if (!parsed.success || !isValidLocale(parsed.data.locale)) {
    return {
      errorKey: "invalidInput",
      candidates: [],
    };
  }

  return {
    errorKey: null,
    candidates: await searchIssueNumberCandidates({
      publicationIssueId: parsed.data.publicationIssueId,
      query: parsed.data.query,
    }),
  };
};

export const savePublicationIssueMappingRegistry = async (
  input: z.input<typeof saveRegistrySchema>,
): Promise<SavePublicationIssueMappingRegistryResult> => {
  const permission = await canManageMappings();

  if (permission.errorKey) {
    return {
      errorKey: permission.errorKey,
    };
  }

  const parsed = saveRegistrySchema.safeParse(input);

  if (!parsed.success || !isValidLocale(parsed.data.locale)) {
    return {
      errorKey: "invalidInput",
    };
  }

  await Promise.all([
    ...parsed.data.publicationSelections.map((selection) =>
      replacePublicationMappings({
        publicationId: selection.publicationId,
        selections: selection.selectionIds.map((externalEditionId) => ({
          externalEditionId,
        })),
      }),
    ),
    ...parsed.data.issueSelections.map((selection) =>
      replaceIssueNumberMappings({
        issueNumberId: selection.issueNumberId,
        selections: selection.selectionIds.map((externalIssueId) => ({
          externalIssueId,
        })),
      }),
    ),
  ]);

  revalidatePath(`/${parsed.data.locale}/dashboard`, "layout");

  return {
    errorKey: null,
  };
};
