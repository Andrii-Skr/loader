import { describe, expect, it } from "vitest";

import {
  getOccurrenceDocumentLabel,
  getOccurrenceRawText,
} from "@/lib/publication-mappings/tooltip";

describe("publication mapping tooltip helpers", () => {
  it("prefers documentNumber and rawRowText when present", () => {
    const occurrence = {
      documentNumber: "  45-7 ",
      sourceFileName: "invoice.pdf",
      description: 'Журнал "Карамельки" №5',
      rawRowText: "  Raw pair text  ",
    };

    expect(getOccurrenceDocumentLabel(occurrence)).toBe("45-7");
    expect(getOccurrenceRawText(occurrence)).toBe('Журнал "Карамельки" №5');
  });

  it("falls back to sourceFileName and raw row text when description is empty", () => {
    const occurrence = {
      documentNumber: " ",
      sourceFileName: "fallback.pdf",
      description: " ",
      rawRowText: 'Журнал "Карамельки" №5',
    };

    expect(getOccurrenceDocumentLabel(occurrence)).toBe("fallback.pdf");
    expect(getOccurrenceRawText(occurrence)).toBe('Журнал "Карамельки" №5');
  });
});
