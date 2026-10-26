import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findRow: vi.fn(),
  save: vi.fn(),
  load: vi.fn(),
  search: vi.fn(),
  forget: vi.fn(),
  lines: vi.fn(),
  enrich: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { specialDocument: { findFirst: mocks.findRow } } }));
vi.mock("@/lib/publication-mappings/collection-presets-service", () => ({
  CollectionPresetError: class extends Error {},
  saveCollectionPreset: mocks.save,
  getCollectionPreset: mocks.load,
  searchCollectionPresets: mocks.search,
  deleteCollectionPreset: mocks.forget,
  enrichCollectionLine: mocks.enrich,
}));
vi.mock("@/lib/publication-mappings/queries", () => ({ getDocumentLineAllocations: mocks.lines }));

import {
  forgetCollectionPreset,
  loadSavedCollectionPreset,
  rememberCollectionPreset,
  searchSavedCollectionPresets,
} from "./collection-presets";

const input = {
  locale: "ru" as const,
  documentId: 10,
  specialDocumentId: 20,
  name: "Календар",
  editionIds: [2, 3],
};

describe("collection composition actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "1", role: "OPERATOR" } });
    mocks.findRow.mockResolvedValue({
      description: "Raw description",
      publicationIssue: { publication: { displayName: "Parsed name" } },
    });
    mocks.save.mockResolvedValue(7);
    mocks.load.mockResolvedValue({ id: 7, name: "Календар", editions: [], unavailable: false });
  });

  it("requires authentication for every operation before touching data", async () => {
    mocks.auth.mockResolvedValue(null);
    for (const result of await Promise.all([
      rememberCollectionPreset(input),
      searchSavedCollectionPresets({ query: "" }),
      loadSavedCollectionPreset({ ...input, presetId: 7 }),
      forgetCollectionPreset({ ...input, presetId: 7 }),
    ]))
      expect(result.errorKey).toBe("missingSession");
    expect(mocks.findRow).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.forget).not.toHaveBeenCalled();
  });

  it("validates locale, name, identifiers and nonempty edition lists", async () => {
    for (const invalid of [
      { ...input, locale: "de" },
      { ...input, name: " " },
      { ...input, editionIds: [] },
      { ...input, editionIds: [-1] },
      { ...input, specialDocumentId: 0 },
    ])
      expect((await rememberCollectionPreset(invalid as typeof input)).errorKey).toBe(
        "invalidInput",
      );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("derives the alias server-side and checks that the line belongs to the document", async () => {
    expect((await rememberCollectionPreset(input)).errorKey).toBeNull();
    expect(mocks.findRow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20, documentId: 10 } }),
    );
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ key: "Parsed name", editionIds: [2, 3] }),
    );
  });

  it("links the full raw description for unparsed lines", async () => {
    mocks.findRow.mockResolvedValue({ description: "Raw description", publicationIssue: null });
    await rememberCollectionPreset(input);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ key: "Raw description" }));
  });

  it("rejects missing lines before saving or deleting", async () => {
    mocks.findRow.mockResolvedValue(null);
    expect((await rememberCollectionPreset(input)).errorKey).toBe("invalidInput");
    expect((await forgetCollectionPreset({ ...input, presetId: 7 })).errorKey).toBe("invalidInput");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.forget).not.toHaveBeenCalled();
  });

  it("refuses unavailable compositions without applying a partial result", async () => {
    mocks.lines.mockResolvedValue([{ specialDocumentId: 20 }]);
    mocks.load.mockResolvedValue({ id: 7, unavailable: true, editions: [] });
    expect((await loadSavedCollectionPreset({ ...input, presetId: 7 })).errorKey).toBe(
      "presetUnavailable",
    );
    expect(mocks.enrich).not.toHaveBeenCalled();
  });
});
