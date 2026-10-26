import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCollectionKey } from "./collection-presets";
import { getExternalEditionSourceCode } from "./config";
import { getExternalEditionsByIds } from "./external-repository";
import { searchIssueNumberCandidates } from "./service";
import { runMappingTransaction } from "./transaction";
import type { CollectionPresetDto, DocumentLineAllocationDto } from "./types";

const presetInclude = { editions: { orderBy: { position: "asc" as const } } };
type PresetRecord = Prisma.CollectionPresetGetPayload<{ include: typeof presetInclude }>;

export class CollectionPresetError extends Error {
  constructor(public readonly errorKey: "presetConflict" | "presetUnavailable" | "invalidInput") {
    super(errorKey);
  }
}

export const hydrateCollectionPreset = async (
  preset: PresetRecord,
): Promise<CollectionPresetDto> => {
  const editions = await getExternalEditionsByIds(
    preset.editions.map((item) => item.externalEditionId),
  );
  const byId = new Map(editions.map((edition) => [edition.id, edition]));
  const unavailable = preset.editions.some((item) => !byId.has(item.externalEditionId));
  return {
    id: preset.id,
    name: preset.name,
    unavailable,
    editions: unavailable
      ? []
      : preset.editions.flatMap((item) => {
          const edition = byId.get(item.externalEditionId);
          return edition
            ? [{ externalEditionId: edition.id, externalEditionName: edition.name }]
            : [];
        }),
  };
};

export const findCollectionPreset = async (key: string) => {
  const alias = await prisma.collectionPresetAlias.findUnique({
    where: {
      sourceCode_key: {
        sourceCode: getExternalEditionSourceCode(),
        key: normalizeCollectionKey(key),
      },
    },
    include: { preset: { include: presetInclude } },
  });
  return alias ? hydrateCollectionPreset(alias.preset) : null;
};

export const getCollectionPreset = async (id: number) => {
  const preset = await prisma.collectionPreset.findFirst({
    where: { id, sourceCode: getExternalEditionSourceCode() },
    include: presetInclude,
  });
  return preset ? hydrateCollectionPreset(preset) : null;
};

export const searchCollectionPresets = async (query: string) =>
  prisma.collectionPreset.findMany({
    where: {
      sourceCode: getExternalEditionSourceCode(),
      normalizedName: { contains: normalizeCollectionKey(query) },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 40,
  });

export const enrichCollectionLine = async (
  line: DocumentLineAllocationDto,
  selected?: CollectionPresetDto | null,
): Promise<DocumentLineAllocationDto> => {
  const preset =
    selected === undefined
      ? await findCollectionPreset(line.parsedPublicationName || line.description)
      : selected;
  if (!preset || preset.unavailable || line.allocations.length > 0) {
    return { ...line, collectionPreset: preset, presetIssueCandidates: {} };
  }
  const entries = line.publicationIssueId
    ? await Promise.all(
        preset.editions.map(
          async (edition) =>
            [
              edition.externalEditionId,
              await searchIssueNumberCandidates({
                publicationIssueId: line.publicationIssueId as number,
                externalEditionId: edition.externalEditionId,
              }),
            ] as const,
        ),
      )
    : [];
  return { ...line, collectionPreset: preset, presetIssueCandidates: Object.fromEntries(entries) };
};

export const saveCollectionPreset = async (input: {
  presetId?: number;
  name: string;
  key: string;
  editionIds: number[];
}) => {
  const sourceCode = getExternalEditionSourceCode();
  const normalizedName = normalizeCollectionKey(input.name);
  const keys = [...new Set([normalizedName, normalizeCollectionKey(input.key)])];
  const editionIds = [...new Set(input.editionIds)];
  const editions = await getExternalEditionsByIds(editionIds);
  if (editions.length !== editionIds.length) throw new CollectionPresetError("presetUnavailable");
  try {
    return await runMappingTransaction(async (tx) => {
      const existing = input.presetId
        ? await tx.collectionPreset.findFirst({ where: { id: input.presetId, sourceCode } })
        : await tx.collectionPreset.findUnique({
            where: { sourceCode_normalizedName: { sourceCode, normalizedName } },
          });
      if (input.presetId && !existing) throw new CollectionPresetError("invalidInput");
      const conflicts = await tx.collectionPresetAlias.findMany({
        where: { sourceCode, key: { in: keys } },
      });
      if (conflicts.some((alias) => alias.presetId !== existing?.id))
        throw new CollectionPresetError("presetConflict");
      const preset = existing
        ? await tx.collectionPreset.update({
            where: { id: existing.id },
            data: { name: input.name.trim(), normalizedName },
          })
        : await tx.collectionPreset.create({
            data: { name: input.name.trim(), normalizedName, sourceCode },
          });
      await tx.collectionPresetEdition.deleteMany({ where: { presetId: preset.id } });
      await tx.collectionPresetEdition.createMany({
        data: editionIds.map((externalEditionId, position) => ({
          presetId: preset.id,
          externalEditionId,
          position,
        })),
      });
      for (const key of keys) {
        await tx.collectionPresetAlias.upsert({
          where: { sourceCode_key: { sourceCode, key } },
          update: {},
          create: { sourceCode, key, presetId: preset.id },
        });
      }
      return preset.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new CollectionPresetError("presetConflict");
    throw error;
  }
};

export const deleteCollectionPreset = async (id: number) => {
  await prisma.collectionPreset.deleteMany({
    where: { id, sourceCode: getExternalEditionSourceCode() },
  });
};
