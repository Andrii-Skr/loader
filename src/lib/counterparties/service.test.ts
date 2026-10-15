import type { ParsedVatInvoice } from "@/lib/pdf/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  db: {
    supplier: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    recipient: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    supplierAlias: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    recipientAlias: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (db: typeof state.db) => unknown) => fn(state.db)) },
}));
import { PartyResolutionError, PartySelectionRequired, resolveCounterparties } from "./service";
const supplier = { id: 1, name: "Тестова друкарня", taxId: "333333333333", kpp: null };
const recipient = { id: 5, name: "Демо", taxId: "222222222222", kpp: null };
const invoice = (
  supplierName = supplier.name,
  recipientName = recipient.name,
): ParsedVatInvoice => ({
  documentType: "Рахунок",
  documentNumber: "1",
  documentDate: "01.01.2026",
  supplier: { name: supplierName, taxId: supplier.taxId, kpp: null },
  recipient: { name: recipientName, taxId: null, kpp: null },
  totalAmount: "0",
  vatAmount: "0",
  baseAmount: "0",
  lineItems: [],
  rawText: "",
  reviewRequired: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  state.db.supplier.findMany.mockResolvedValue([supplier]);
  state.db.recipient.findMany.mockResolvedValue([recipient]);
  state.db.recipientAlias.findMany.mockResolvedValue([]);
  state.db.recipient.update.mockImplementation(async ({ data, where }) => ({
    ...recipient,
    ...data,
    id: where.id,
  }));
  state.db.supplier.update.mockImplementation(async ({ data, where }) => ({
    ...supplier,
    ...data,
    id: where.id,
  }));
  state.db.supplierAlias.upsert.mockImplementation(async ({ create }) => create);
  state.db.recipientAlias.upsert.mockImplementation(async ({ create }) => create);
  state.db.supplierAlias.findUnique.mockResolvedValue(null);
  state.db.recipientAlias.findUnique.mockResolvedValue(null);
  state.db.supplier.findUnique.mockResolvedValue(supplier);
  state.db.recipient.findUnique.mockResolvedValue(recipient);
  state.db.supplier.upsert.mockImplementation(async ({ create }) => ({ id: 10, ...create }));
  state.db.recipient.upsert.mockImplementation(async ({ create }) => ({ id: 20, ...create }));
});
describe("counterparty resolution", () => {
  it("reuses canonical cards without modifying their names", async () => {
    expect(await resolveCounterparties(invoice('ПП "Тестова друкарня"', '"Демо"'), "UA")).toEqual({
      supplier,
      recipient,
    });
    expect(state.db.supplier.upsert).not.toHaveBeenCalled();
    expect(state.db.recipient.upsert).not.toHaveBeenCalled();
  });
  it("asks for unknown names and creates no cards or aliases", async () => {
    await expect(
      resolveCounterparties(invoice(supplier.name, "Демоа"), "UA"),
    ).rejects.toBeInstanceOf(PartySelectionRequired);
    expect(state.db.recipient.upsert).not.toHaveBeenCalled();
    expect(state.db.recipientAlias.upsert).not.toHaveBeenCalled();
  });
  it("remembers a confirmed name for the particular supplier", async () => {
    const result = await resolveCounterparties(invoice(supplier.name, "Демоа"), "UA", {
      recipient: { mode: "existing", id: 5 },
    });
    expect(result.recipient).toEqual(recipient);
    expect(state.db.recipientAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          contour: "UA",
          normalizedName: "демоа",
          rawName: "Демоа",
          sourceSupplierTaxId: supplier.taxId,
          recipientId: 5,
        },
      }),
    );
    expect(state.db.recipient.upsert).not.toHaveBeenCalled();
  });
  it("prefers a supplier-specific alias over the global alias", async () => {
    state.db.recipientAlias.findUnique.mockImplementation(async ({ where }) =>
      where.contour_normalizedName_sourceSupplierTaxId.sourceSupplierTaxId === supplier.taxId
        ? { recipient }
        : { recipient: { id: 8, name: "Other", taxId: "8" } },
    );
    expect((await resolveCounterparties(invoice(supplier.name, "Alias"), "UA")).recipient.id).toBe(
      5,
    );
  });
  it("does not reuse an alias from another supplier", async () => {
    state.db.recipientAlias.findUnique.mockImplementation(async ({ where }) =>
      where.contour_normalizedName_sourceSupplierTaxId.sourceSupplierTaxId === "another"
        ? { recipient }
        : null,
    );
    await expect(
      resolveCounterparties(invoice(supplier.name, "Alias"), "UA"),
    ).rejects.toBeInstanceOf(PartySelectionRequired);
  });
  it("creates a card only after explicit confirmation", async () => {
    const result = await resolveCounterparties(invoice(supplier.name, "New company"), "UA", {
      recipient: { mode: "create", name: "Our new company" },
    });
    expect(result.recipient.name).toBe("Our new company");
    expect(result.recipient.taxId).toMatch(/^name:/u);
    expect(state.db.recipient.upsert).toHaveBeenCalledOnce();
    expect(state.db.recipientAlias.upsert).toHaveBeenCalledOnce();
  });
  it("never overwrites an alias belonging to another card", async () => {
    state.db.recipientAlias.findUnique.mockResolvedValue({
      recipientId: 9,
      recipient: { id: 9, name: "Other", taxId: "other" },
    });
    const parsed = invoice(supplier.name, "Alias");
    parsed.recipient.taxId = "222222222222";
    // Direct alias management rejects collisions as well as the import path.
    const { rememberPartyAlias } = await import("./service");
    await expect(
      rememberPartyAlias(state.db as never, {
        role: "recipient",
        id: 5,
        contour: "UA",
        name: "Alias",
        sourceSupplierTaxId: supplier.taxId,
      }),
    ).rejects.toBeInstanceOf(PartyResolutionError);
    expect(state.db.recipientAlias.upsert).not.toHaveBeenCalled();
  });
  it("rejects an existing-card choice with conflicting tax details", async () => {
    const parsed = invoice(supplier.name, "Unknown");
    parsed.recipient.taxId = "000000000000";
    await expect(
      resolveCounterparties(parsed, "UA", { recipient: { mode: "existing", id: 5 } }),
    ).rejects.toThrow("taxConflict");
    expect(state.db.recipientAlias.upsert).not.toHaveBeenCalled();
  });
  it("checks both roles before applying either choice", async () => {
    const parsed = invoice("New supplier", "New recipient");
    parsed.supplier.taxId = null;
    await expect(
      resolveCounterparties(parsed, "UA", { supplier: { mode: "create", name: "New supplier" } }),
    ).rejects.toBeInstanceOf(PartySelectionRequired);
    expect(state.db.supplier.upsert).not.toHaveBeenCalled();
  });
  it("requires confirmation before attaching a newly observed tax ID to a name-only card", async () => {
    const synthetic = { ...recipient, taxId: "name:legacy" };
    state.db.recipient.findMany.mockResolvedValue([synthetic]);
    state.db.recipient.findUnique.mockResolvedValue(synthetic);
    state.db.recipientAlias.findUnique.mockResolvedValue({
      recipientId: synthetic.id,
      recipient: synthetic,
    });
    const parsed = invoice(supplier.name, "Alias");
    parsed.recipient.taxId = recipient.taxId;
    await expect(resolveCounterparties(parsed, "UA")).rejects.toBeInstanceOf(
      PartySelectionRequired,
    );
    const result = await resolveCounterparties(parsed, "UA", {
      recipient: { mode: "existing", id: 5 },
    });
    expect(result.recipient.taxId).toBe(recipient.taxId);
    expect(state.db.recipient.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { taxId: recipient.taxId, kpp: null },
    });
  });
  it("rejects creating another name-only card under an existing canonical name", async () => {
    await expect(
      resolveCounterparties(invoice(supplier.name, "Typo"), "UA", {
        recipient: { mode: "create", name: "Демо" },
      }),
    ).rejects.toThrow("duplicateName");
    expect(state.db.recipient.upsert).not.toHaveBeenCalled();
  });
  it("detects a conflicting alias created concurrently during confirmation", async () => {
    state.db.recipientAlias.upsert.mockResolvedValue({ recipientId: 9 });
    await expect(
      resolveCounterparties(invoice(supplier.name, "Typo"), "UA", {
        recipient: { mode: "existing", id: 5 },
      }),
    ).rejects.toThrow("aliasConflict");
  });
});
