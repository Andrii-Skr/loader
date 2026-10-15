import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: vi.fn(),
  save: vi.fn(),
  merge: vi.fn(),
  alias: vi.fn(),
  revalidate: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: state.auth }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/counterparties/manage", () => ({
  saveCanonicalParty: state.save,
  mergeCanonicalParties: state.merge,
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: state.transaction } }));
import { addCounterpartyAlias, mergeCounterparties, saveCounterparty } from "./counterparties";
beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mockResolvedValue({ user: { id: 1, role: "OPERATOR" } });
});
it("requires authentication for directory mutations", async () => {
  state.auth.mockResolvedValue(null);
  expect(await saveCounterparty({ role: "recipient", id: 5, name: "Демо", taxId: "" })).toEqual({
    errorKey: "missingSession",
  });
  expect(state.save).not.toHaveBeenCalled();
});
it("validates names and identifiers before touching the database", async () => {
  expect(await saveCounterparty({ role: "recipient", id: 5, name: " ", taxId: "" })).toEqual({
    errorKey: "invalidInput",
  });
  expect(await mergeCounterparties({ role: "recipient", sourceId: -1, targetId: 5 })).toEqual({
    errorKey: "invalidInput",
  });
  expect(
    await addCounterpartyAlias({
      role: "recipient",
      id: 0,
      name: "Alias",
      contour: "UA",
      sourceSupplierTaxId: "",
    }),
  ).toEqual({ errorKey: "invalidInput" });
  expect(state.save).not.toHaveBeenCalled();
  expect(state.merge).not.toHaveBeenCalled();
  expect(state.transaction).not.toHaveBeenCalled();
});
it("saves canonical names and revalidates all three locales", async () => {
  const input = { role: "recipient" as const, id: 5, name: "Демо", taxId: "" };
  expect(await saveCounterparty(input)).toEqual({ errorKey: null });
  expect(state.save).toHaveBeenCalledWith(input);
  for (const locale of ["ru", "uk", "en"])
    expect(state.revalidate).toHaveBeenCalledWith(`/${locale}/dashboard`, "layout");
});
