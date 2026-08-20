import { describe, expect, it } from "vitest";

import { matchesNormalizedComboboxSearch } from "@/components/ui/combobox-search";

describe("matchesNormalizedComboboxSearch", () => {
  it("keeps only matching issue-number fragments", () => {
    const labels = ["02-23", "02-22", "02-21", "02-22(Сентябрь)", "2022", "2024"];

    expect(labels.filter((label) => matchesNormalizedComboboxSearch(label, "02-22"))).toEqual([
      "02-22",
      "02-22(Сентябрь)",
    ]);
  });

  it("matches equivalent separators", () => {
    expect(matchesNormalizedComboboxSearch("02/21", "02-2")).toBe(true);
    expect(matchesNormalizedComboboxSearch("02-21", "0221")).toBe(true);
  });
});
