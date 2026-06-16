import { describe, expect, it } from "vitest";

import {
  normalizeIssueLookupText,
  normalizeMatchingText,
  scoreIssueSimilarity,
  scoreTextSimilarity,
} from "@/lib/publication-mappings/matching";

describe("normalizeMatchingText", () => {
  it("normalizes punctuation, spaces and bracketed R markers", () => {
    expect(normalizeMatchingText("1000 порад. Кейворди (R)")).toBe(
      normalizeMatchingText("1000   порад кейворди (р)"),
    );
  });

  it("does not rewrite regular letters inside the publication title", () => {
    expect(normalizeMatchingText("Філворди")).toBe("філворди");
  });
});

describe("edition ranking primitives", () => {
  it("scores a more specific partial title higher than a shorter generic one", () => {
    const target = "Кейворди. Спецвипуск (р)";
    const genericScore = scoreTextSimilarity(target, "Кейворди");
    const specificScore = scoreTextSimilarity(target, "Кейворди. Спецвипуск");

    expect(specificScore).toBeGreaterThan(genericScore);
  });
});

describe("issue ranking primitives", () => {
  it("scores exact issue number higher than loosely matching reversed-looking values", () => {
    const target = "09-26";
    const exactScore = Math.max(
      scoreTextSimilarity(normalizeIssueLookupText(target), normalizeIssueLookupText("09-26")),
      scoreTextSimilarity(target, "09-26"),
    );
    const looseScore = Math.max(
      scoreTextSimilarity(normalizeIssueLookupText(target), normalizeIssueLookupText("-7-09")),
      scoreTextSimilarity(target, "-7-09"),
    );

    expect(exactScore).toBeGreaterThan(looseScore);
  });

  it("prefers the same primary and year over a truncated or fractional variant", () => {
    const target = "03-26 (ключвордія)";

    const plainScore = scoreIssueSimilarity(target, "03");
    const sameYearScore = scoreIssueSimilarity(target, "03-26(Кейвордія)");
    const fractionalScore = scoreIssueSimilarity(target, "03/1-26(Легко і просто)");

    expect(sameYearScore).toBeGreaterThan(plainScore);
    expect(plainScore).toBeGreaterThan(fractionalScore);
  });
});
