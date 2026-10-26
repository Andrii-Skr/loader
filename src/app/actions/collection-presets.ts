"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { collectionPresetNameSchema } from "@/lib/publication-mappings/collection-presets";
import {
  CollectionPresetError,
  deleteCollectionPreset,
  enrichCollectionLine,
  getCollectionPreset,
  saveCollectionPreset,
  searchCollectionPresets,
} from "@/lib/publication-mappings/collection-presets-service";
import { getDocumentLineAllocations } from "@/lib/publication-mappings/queries";
import type {
  CollectionPresetDto,
  DocumentLineAllocationDto,
} from "@/lib/publication-mappings/types";
import { appAction } from "@/utils/appAction";

const contextSchema = z.object({
  locale: z.enum(routing.locales),
  documentId: z.number().int().positive(),
  specialDocumentId: z.number().int().positive(),
});
const searchSchema = z.object({ query: z.string().max(160) });
const saveSchema = contextSchema.extend({
  name: collectionPresetNameSchema("invalidInput").shape.name,
  presetId: z.number().int().positive().optional(),
  editionIds: z.array(z.number().int().positive()).min(1).max(200),
});
const selectSchema = contextSchema.extend({ presetId: z.number().int().positive() });

type ErrorKey = "invalidInput" | "missingSession" | "presetConflict" | "presetUnavailable";
type Result = {
  errorKey: ErrorKey | null;
  preset?: CollectionPresetDto;
  line?: DocumentLineAllocationDto;
  presets?: Array<{ id: number; name: string }>;
};
const options = <T>(schema: { safeParse: (input: T) => z.SafeParseReturnType<T, T> }) => ({
  schema,
  requireAuth: true,
  onUnauthorized: (): Result => ({ errorKey: "missingSession" }),
  onInvalidInput: (): Result => ({ errorKey: "invalidInput" }),
});

export const searchSavedCollectionPresets = async (
  input: z.infer<typeof searchSchema>,
): Promise<Result> =>
  appAction(
    async (parsed: z.infer<typeof searchSchema>): Promise<Result> => ({
      errorKey: null,
      presets: await searchCollectionPresets(parsed.query),
    }),
    options(searchSchema),
  )(input);

export const rememberCollectionPreset = async (
  input: z.infer<typeof saveSchema>,
): Promise<Result> =>
  appAction(async (parsed: z.infer<typeof saveSchema>): Promise<Result> => {
    const row = await prisma.specialDocument.findFirst({
      where: { id: parsed.specialDocumentId, documentId: parsed.documentId },
      select: {
        description: true,
        publicationIssue: { select: { publication: { select: { displayName: true } } } },
      },
    });
    if (!row) return { errorKey: "invalidInput" };
    try {
      const id = await saveCollectionPreset({
        ...parsed,
        key: row.publicationIssue?.publication.displayName || row.description,
      });
      const preset = await getCollectionPreset(id);
      revalidatePath(`/${parsed.locale}/dashboard/publication-issue-mappings`);
      return preset ? { errorKey: null, preset } : { errorKey: "invalidInput" };
    } catch (error) {
      if (error instanceof CollectionPresetError) return { errorKey: error.errorKey };
      throw error;
    }
  }, options(saveSchema))(input);

export const loadSavedCollectionPreset = async (
  input: z.infer<typeof selectSchema>,
): Promise<Result> =>
  appAction(async (parsed: z.infer<typeof selectSchema>): Promise<Result> => {
    const [lines, preset] = await Promise.all([
      getDocumentLineAllocations(parsed.documentId),
      getCollectionPreset(parsed.presetId),
    ]);
    const line = lines.find((item) => item.specialDocumentId === parsed.specialDocumentId);
    if (!line || !preset) return { errorKey: "invalidInput" };
    if (preset.unavailable) return { errorKey: "presetUnavailable" };
    return { errorKey: null, preset, line: await enrichCollectionLine(line, preset) };
  }, options(selectSchema))(input);

export const forgetCollectionPreset = async (
  input: z.infer<typeof selectSchema>,
): Promise<Result> =>
  appAction(async (parsed: z.infer<typeof selectSchema>): Promise<Result> => {
    const row = await prisma.specialDocument.findFirst({
      where: { id: parsed.specialDocumentId, documentId: parsed.documentId },
      select: { id: true },
    });
    if (!row) return { errorKey: "invalidInput" };
    await deleteCollectionPreset(parsed.presetId);
    revalidatePath(`/${parsed.locale}/dashboard/publication-issue-mappings`);
    return { errorKey: null };
  }, options(selectSchema))(input);
