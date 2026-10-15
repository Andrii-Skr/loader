import { describe, expect, it } from "vitest";
import { matchParty, partyNameKey } from "./matching";
const demo = { id: 5, name: "Демо", taxId: "222222222222" };
const other = { id: 6, name: "Other", taxId: "123456789012" };
const party = (name: string, taxId: string | null = null, kpp: string | null = null) => ({
  name,
  taxId,
  kpp,
});
describe("counterparty identity", () => {
  it("normalizes legal prefixes, quote styles and spacing", () => {
    expect(partyNameKey('Товариство з обмеженою відповідальністю "Видавництво"Демо"')).toBe("демо");
    expect(partyNameKey("«Демо»")).toBe("демо");
  });
  it("prefers a tax ID over a misleading name or alias", () => {
    expect(
      matchParty({
        party: party("Other", demo.taxId),
        contour: "UA",
        options: [demo, other],
        alias: other,
      }),
    ).toEqual(demo);
  });
  it("requires confirmation for an unknown tax ID even with an exact name", () => {
    expect(
      matchParty({ party: party("Демо", "000000000000"), contour: "UA", options: [demo] }),
    ).toBeNull();
  });
  it("rejects an alias with conflicting real tax details", () => {
    expect(
      matchParty({
        party: party("Alias", "000000000000"),
        contour: "UA",
        options: [demo],
        alias: demo,
      }),
    ).toBeNull();
  });
  it("matches a known name without tax details but never a fuzzy name", () => {
    expect(matchParty({ party: party('"Демо"'), contour: "UA", options: [demo] })).toEqual(demo);
    expect(matchParty({ party: party("Демоа"), contour: "UA", options: [demo] })).toBeNull();
  });
  it("does not guess between two identical canonical names", () => {
    expect(
      matchParty({
        party: party("Демо"),
        contour: "UA",
        options: [demo, { ...other, name: "Демо" }],
      }),
    ).toBeNull();
  });
  it("distinguishes Russian branches by KPP", () => {
    const branch = { ...demo, taxId: "1234567890/770101001" };
    expect(
      matchParty({
        party: party("Демо", "1234567890", "770101001"),
        contour: "RU",
        options: [branch],
      }),
    ).toEqual(branch);
    expect(
      matchParty({
        party: party("Демо", "1234567890", "770101002"),
        contour: "RU",
        options: [branch],
      }),
    ).toBeNull();
  });
});
