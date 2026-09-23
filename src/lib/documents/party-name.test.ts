import { describe, expect, it } from "vitest";

import { normalizePartyName } from "@/lib/documents/party-name";

describe("normalizePartyName", () => {
  it.each([
    ['ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "ЛАНДПРЕСС"', '"ЛАНДПРЕСС"'],
    ['Товаристо з обмеженою відповідальністю "Видавництво "Кузя"', '"Кузя"'],
    ['ПРИВАТНЕ ПІДПРИЄМСТВО "ВОЛИНСЬКА ДРУКАРНЯ"', '"ВОЛИНСЬКА ДРУКАРНЯ"'],
    ['"ВИДАВНИЧИЙ ДІМ "ЄВРОПЕЙСЬКИЙ ВИБІР"', '"ЄВРОПЕЙСЬКИЙ ВИБІР"'],
  ])("returns %s as %s", (input, expected) => {
    expect(normalizePartyName(input)).toBe(expected);
  });
});
