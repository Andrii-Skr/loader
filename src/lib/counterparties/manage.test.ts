import { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: {
    supplier: { findUniqueOrThrow: vi.fn(), delete: vi.fn() },
    recipient: { findUniqueOrThrow: vi.fn(), delete: vi.fn() },
    supplierAlias: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    recipientAlias: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    document: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (db: typeof state.db) => unknown) => fn(state.db)) },
}));
import { mergeCanonicalParties } from "./manage";
beforeEach(() => {
  vi.resetAllMocks();
  const source = {
    id: 10,
    name: '"Демо"',
    taxId: "name:legacy",
    aliases: [{ id: 40, contour: "UA", normalizedName: "демо", rawName: '"Демо"' }],
  };
  const target = { id: 5, name: "Демо", taxId: "222222222222" };
  for (const role of ["supplier", "recipient"] as const) {
    state.db[role].findUniqueOrThrow.mockImplementation(async ({ where }) =>
      where.id === 10 ? source : target,
    );
    state.db[`${role}Alias`].findUnique.mockResolvedValue(null);
    state.db[`${role}Alias`].upsert.mockImplementation(async ({ create }) => create);
  }
  state.db.document.findMany.mockResolvedValue([{ documentContour: "UA" }]);
  state.db.recipientAlias.findMany.mockResolvedValue([]);
});
describe("counterparty merges", () => {
  it("transfers document references and aliases, preserving document and line identities", async () => {
    await mergeCanonicalParties("recipient", 10, 5);
    expect(state.db.document.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 10 },
      data: { recipientId: 5 },
    });
    expect(state.db.recipientAlias.update).toHaveBeenCalledWith({
      where: { id: 40 },
      data: { recipientId: 5 },
    });
    expect(state.db.recipientAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ recipientId: 5, rawName: '"Демо"' }),
      }),
    );
    expect(state.db.recipient.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
  it("rejects merging real identities with different tax IDs before changing references", async () => {
    state.db.recipient.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 10, name: "Other", taxId: "123456789012", aliases: [] })
      .mockResolvedValueOnce({ id: 5, name: "Демо", taxId: "222222222222" });
    await expect(mergeCanonicalParties("recipient", 10, 5)).rejects.toThrow("taxConflict");
    expect(state.db.document.updateMany).not.toHaveBeenCalled();
    expect(state.db.recipient.delete).not.toHaveBeenCalled();
  });
  it("rejects a supplier merge if document version keys would collide", async () => {
    state.db.document.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }),
    );
    await expect(mergeCanonicalParties("supplier", 10, 5)).rejects.toThrow("mergeConflict");
    expect(state.db.supplier.delete).not.toHaveBeenCalled();
  });
  it("moves supplier-specific recipient aliases to the retained supplier scope", async () => {
    state.db.recipientAlias.findMany.mockResolvedValue([
      { id: 11, contour: "UA", normalizedName: "alias", recipientId: 5 },
    ]);
    await mergeCanonicalParties("supplier", 10, 5);
    expect(state.db.recipientAlias.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { sourceSupplierTaxId: "222222222222" },
    });
  });
  it("refuses conflicting recipient scopes when merging suppliers", async () => {
    state.db.recipientAlias.findMany.mockResolvedValue([
      { id: 11, contour: "UA", normalizedName: "alias", recipientId: 5 },
    ]);
    state.db.recipientAlias.findUnique.mockResolvedValue({ id: 12, recipientId: 6 });
    await expect(mergeCanonicalParties("supplier", 10, 5)).rejects.toThrow("aliasConflict");
    expect(state.db.supplier.delete).not.toHaveBeenCalled();
  });
});
