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

  it("prefers a close inflection over an unrelated title", () => {
    const target = "Саморобка";
    const closeInflectionScore = scoreTextSimilarity(target, "Саморобки");
    const unrelatedScore = scoreTextSimilarity(target, "Кейвордія");

    expect(closeInflectionScore).toBeGreaterThan(unrelatedScore);
  });

  it("keeps a minor typo closer than a different word", () => {
    const target = "Кейворди";
    const typoScore = scoreTextSimilarity(target, "Кейвордии");
    const unrelatedScore = scoreTextSimilarity(target, "Філворди");

    expect(typoScore).toBeGreaterThan(unrelatedScore);
  });

  it("tolerates an accidental repeated letter in a mixed-script title", () => {
    const target = "Гіігантский слон";
    const repeatedLetterScore = scoreTextSimilarity(target, "Гигантский Слон");
    const unrelatedScore = scoreTextSimilarity(target, "Банзай");

    expect(repeatedLetterScore).toBeGreaterThan(0.85);
    expect(repeatedLetterScore).toBeGreaterThan(unrelatedScore);
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

  it("prefers a close label inflection over a different label for the same issue number", () => {
    const target = "05-26 (саморобка)";

    const closeInflectionScore = scoreIssueSimilarity(target, "05-26(Саморобки)");
    const differentLabelScore = scoreIssueSimilarity(target, "05-26(Кейвордія)");

    expect(closeInflectionScore).toBeGreaterThan(differentLabelScore);
  });

  it("penalizes an extra label when the target issue has no label", () => {
    const target = "05-26";

    const plainScore = scoreIssueSimilarity(target, "05-26");
    const extraLabelScore = scoreIssueSimilarity(target, "05-26(Саморобки)");

    expect(plainScore).toBeGreaterThan(extraLabelScore);
  });
});
