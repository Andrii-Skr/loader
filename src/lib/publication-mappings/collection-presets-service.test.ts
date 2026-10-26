import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  presetFindFirst: vi.fn(),
  presetFindUnique: vi.fn(),
  presetCreate: vi.fn(),
  presetUpdate: vi.fn(),
  presetDelete: vi.fn(),
  aliasFindUnique: vi.fn(),
  aliasFindMany: vi.fn(),
  aliasUpsert: vi.fn(),
  editionDelete: vi.fn(),
  editionCreate: vi.fn(),
  external: vi.fn(),
  issues: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    collectionPreset: {
      findFirst: mocks.presetFindFirst,
      findUnique: mocks.presetFindUnique,
      create: mocks.presetCreate,
      update: mocks.presetUpdate,
      deleteMany: mocks.presetDelete,
    },
    collectionPresetAlias: {
      findUnique: mocks.aliasFindUnique,
      findMany: mocks.aliasFindMany,
      upsert: mocks.aliasUpsert,
    },
    collectionPresetEdition: { deleteMany: mocks.editionDelete, createMany: mocks.editionCreate },
  },
}));
vi.mock("./config", () => ({ getExternalEditionSourceCode: () => "test-source" }));
vi.mock("./external-repository", () => ({ getExternalEditionsByIds: mocks.external }));
vi.mock("./service", () => ({ searchIssueNumberCandidates: mocks.issues }));
vi.mock("./transaction", () => ({ runMappingTransaction: mocks.transaction }));

import { prisma } from "@/lib/prisma";
import {
  deleteCollectionPreset,
  enrichCollectionLine,
  findCollectionPreset,
  getCollectionPreset,
  saveCollectionPreset,
} from "./collection-presets-service";
import type { DocumentLineAllocationDto } from "./types";

const stored = {
  id: 7,
  name: "Календар",
  editions: [
    { externalEditionId: 2, position: 0 },
    { externalEditionId: 3, position: 1 },
  ],
};
const input = { name: "Календар", key: "  КАЛЕНДАР  варіант ", editionIds: [2, 3, 2] };
const line = {
  specialDocumentId: 4,
  parsedPublicationName: "Календар",
  description: "Календар № 2",
  publicationIssueId: 8,
  allocations: [],
} as unknown as DocumentLineAllocationDto;

describe("shared collection compositions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.presetFindUnique.mockResolvedValue(null);
    mocks.presetFindFirst.mockResolvedValue(stored);
    mocks.presetCreate.mockResolvedValue(stored);
    mocks.presetUpdate.mockResolvedValue(stored);
    mocks.aliasFindMany.mockResolvedValue([]);
    mocks.aliasFindUnique.mockResolvedValue({ preset: stored });
    mocks.external.mockResolvedValue([
      { id: 3, name: "Current second" },
      { id: 2, name: "Current first" },
    ]);
    mocks.issues.mockResolvedValue([]);
    mocks.transaction.mockImplementation((callback) => callback(prisma));
  });

  it("stores unique ordered editions without document financial or issue data", async () => {
    await expect(saveCollectionPreset(input)).resolves.toBe(7);
    expect(mocks.external).toHaveBeenCalledWith([2, 3]);
    expect(mocks.editionCreate).toHaveBeenCalledWith({
      data: [
        { presetId: 7, externalEditionId: 2, position: 0 },
        { presetId: 7, externalEditionId: 3, position: 1 },
      ],
    });
    expect(mocks.aliasUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { sourceCode: "test-source", key: "календар варіант", presetId: 7 },
      }),
    );
  });

  it("finds an exact normalized alias in the active catalogue and uses current edition names", async () => {
    const result = await findCollectionPreset("  КАЛЕНДАР ");
    expect(mocks.aliasFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceCode_key: { sourceCode: "test-source", key: "календар" } },
      }),
    );
    expect(result?.editions).toEqual([
      { externalEditionId: 2, externalEditionName: "Current first" },
      { externalEditionId: 3, externalEditionName: "Current second" },
    ]);
  });

  it("does not fuzzy match unknown aliases", async () => {
    mocks.aliasFindUnique.mockResolvedValue(null);
    expect(await findCollectionPreset("Календарр")).toBeNull();
    expect(mocks.external).not.toHaveBeenCalled();
  });

  it("blocks conflicting aliases before any write", async () => {
    mocks.aliasFindMany.mockResolvedValue([{ presetId: 99 }]);
    await expect(saveCollectionPreset(input)).rejects.toMatchObject({ errorKey: "presetConflict" });
    expect(mocks.presetCreate).not.toHaveBeenCalled();
    expect(mocks.editionDelete).not.toHaveBeenCalled();
  });

  it("reports a concurrent uniqueness conflict", async () => {
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7" }),
    );
    await expect(saveCollectionPreset(input)).rejects.toMatchObject({ errorKey: "presetConflict" });
  });

  it("updates the chosen composition and links a new variant explicitly", async () => {
    mocks.aliasFindMany.mockResolvedValue([{ presetId: 7 }]);
    await saveCollectionPreset({ ...input, presetId: 7 });
    expect(mocks.presetUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
    expect(mocks.presetCreate).not.toHaveBeenCalled();
  });

  it("rejects an unknown or other-source composition ID", async () => {
    mocks.presetFindFirst.mockResolvedValue(null);
    await expect(saveCollectionPreset({ ...input, presetId: 9 })).rejects.toMatchObject({
      errorKey: "invalidInput",
    });
    expect(mocks.editionDelete).not.toHaveBeenCalled();
  });

  it("rejects saving unavailable editions and returns no partial composition when loading", async () => {
    mocks.external.mockResolvedValue([{ id: 2, name: "First" }]);
    await expect(saveCollectionPreset(input)).rejects.toMatchObject({
      errorKey: "presetUnavailable",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(await getCollectionPreset(7)).toMatchObject({ unavailable: true, editions: [] });
  });

  it("searches current issue candidates for every composition edition", async () => {
    const enriched = await enrichCollectionLine(line);
    expect(mocks.issues.mock.calls.map(([args]) => args)).toEqual([
      { publicationIssueId: 8, externalEditionId: 2 },
      { publicationIssueId: 8, externalEditionId: 3 },
    ]);
    expect(enriched.collectionPreset?.id).toBe(7);
  });

  it("keeps saved allocations and skips issue initialization", async () => {
    const saved = {
      ...line,
      allocations: [{ externalEditionId: 99 }],
    } as DocumentLineAllocationDto;
    expect((await enrichCollectionLine(saved)).allocations).toBe(saved.allocations);
    expect(mocks.issues).not.toHaveBeenCalled();
  });

  it("uses the full description for an unparsed line without inventing issue candidates", async () => {
    await enrichCollectionLine({ ...line, parsedPublicationName: null, publicationIssueId: null });
    expect(mocks.aliasFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceCode_key: { sourceCode: "test-source", key: "календар № 2" } },
      }),
    );
    expect(mocks.issues).not.toHaveBeenCalled();
  });

  it("deletes only the active-source composition, leaving documents alone", async () => {
    await deleteCollectionPreset(7);
    expect(mocks.presetDelete).toHaveBeenCalledWith({
      where: { id: 7, sourceCode: "test-source" },
    });
  });
});
