import { describe, expect, it, vi } from "vitest";

import { resolvePartyTaxId } from "@/lib/documents/party-tax-id";

describe("resolvePartyTaxId", () => {
  it("uses a stored tax ID only for one exact normalized name match", async () => {
    const findExistingTaxIds = vi.fn().mockResolvedValue([{ taxId: "12345678" }]);

    const taxId = await resolvePartyTaxId({
      party: {
        name: "ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ Альфа Друк",
        taxId: null,
        kpp: null,
      },
      contour: "UA",
      findExistingTaxIds,
    });

    expect(findExistingTaxIds).toHaveBeenCalledWith("Альфа Друк");
    expect(taxId).toBe("12345678");
  });

  it("does not choose an arbitrary tax ID when a name has several matches", async () => {
    const taxId = await resolvePartyTaxId({
      party: { name: "Альфа Друк", taxId: null, kpp: null },
      contour: "UA",
      findExistingTaxIds: vi.fn().mockResolvedValue([{ taxId: "12345678" }, { taxId: "87654321" }]),
    });

    expect(taxId).toMatch(/^name:[a-f0-9]{24}$/u);
  });
});
