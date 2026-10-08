import { expect, it } from "vitest";
import { InvalidDocumentDateError, parseDocumentDate } from "./date";
it.each([
  "31.02.2026",
  "29.02.2026",
  "31.04.2026",
  "00.01.2026",
  "01.13.2026",
  "01.01.0000",
  "2026-01-01",
  "29.02.1900",
])("rejects impossible date %s", (value) => {
  expect(() => parseDocumentDate(value)).toThrow(InvalidDocumentDateError);
});
it.each([
  ["29.02.2024", "2024-02-29"],
  ["29.02.2000", "2000-02-29"],
  ["28.02.1900", "1900-02-28"],
  ["31.12.2026", "2026-12-31"],
])("keeps UTC date %s", (value, iso) => {
  expect(parseDocumentDate(value).toISOString()).toBe(`${iso}T00:00:00.000Z`);
});
