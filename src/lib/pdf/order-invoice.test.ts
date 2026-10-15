import { readFileSync } from "node:fs";
import { normalizePartyName } from "@/lib/documents/party-name";
import { describe, expect, it } from "vitest";
import { preserveEmptyDiscountAmounts } from "./discount-table-text";
import positionedCells from "./fixtures/order-invoices/9005-positions.json";
import { detectAndParseDocument } from "./registry";

const fixture = (number: string) =>
  readFileSync(new URL(`./fixtures/order-invoices/${number}.txt`, import.meta.url), "utf8");
const positionedItems = positionedCells.map(([str, x, y, width, hasEOL]) => ({
  str: String(str),
  transform: [1, 0, 0, 1, Number(x), Number(y)],
  width: Number(width),
  hasEOL: Boolean(hasEOL),
}));

describe("synthetic order invoices", () => {
  it.each([
    {
      number: "9001",
      quantities: ["1.25", "0.875", "2.35", "0.625", "1.125", "1.65", "2.125", "0.95", "1.375"],
      base: "15431.21",
      total: "18517.45",
    },
    {
      number: "9002",
      quantities: ["1.75", "0.425", "1.125", "0.85", "1.35", "2.45"],
      base: "10586.10",
      total: "12703.32",
    },
    {
      number: "9003",
      quantities: [
        "4.25",
        "4.25",
        "1.85",
        "1.85",
        "2.15",
        "2.15",
        "0.425",
        "1.35",
        "0.65",
        "1.45",
        "0.95",
        "1.125",
        "0.525",
      ],
      base: "34396.26",
      total: "41275.51",
    },
    {
      number: "9004",
      quantities: [
        "0.425",
        "3.25",
        "3.25",
        "2.75",
        "2.75",
        "1.85",
        "0.475",
        "0.825",
        "0.625",
        "0.95",
      ],
      base: "27534.09",
      total: "33040.91",
    },
    {
      number: "9005",
      quantities: ["0.75", "1.25", "0.625", "1.375", "1.6", "2.25"],
      base: "11500.70",
      total: "13800.84",
    },
    {
      number: "9006",
      quantities: [
        "1.875",
        "0.425",
        "0.035",
        "3.75",
        "2.125",
        "0.95",
        "1.35",
        "1.125",
        "1.85",
        "1.45",
        "1.45",
        "2.65",
        "2.65",
      ],
      base: "42747.31",
      total: "51296.77",
    },
  ])("parses all rows and totals of invoice $number", ({ number, quantities, base, total }) => {
    const detected = detectAndParseDocument(fixture(number));
    const { parsed } = detected;
    expect(parsed.documentNumber).toBe(number);
    expect(normalizePartyName(parsed.recipient.name)).toBe('"Демо"');
    expect(parsed.lineItems.map((line) => line.quantity)).toEqual(quantities);
    expect(parsed.lineItems.map((line) => line.lineNo)).toEqual(quantities.map((_, i) => i + 1));
    expect(parsed.baseAmount).toBe(base);
    expect(parsed.totalAmount).toBe(total);
    expect(parsed.reviewRequired).toBe(false);
    for (const line of parsed.lineItems) {
      expect(line.description).toMatch(/^ж-л/u);
      expect(
        detected.parsePublicationIssueDescription(line.description, parsed.documentDate)
          ?.canonicalIssueNumber,
      ).toMatch(/^\d{2}-31(?: \(.+\))?$/u);
    }
  });

  it("uses cell positions to distinguish a full discount from no discount", () => {
    const text = preserveEmptyDiscountAmounts(positionedItems);
    expect(text).not.toBeNull();
    const header = fixture("9005").split("№ Номер")[0];
    const { parsed } = detectAndParseDocument(`${header}${text}`);
    expect(parsed.lineItems.map((line) => line.lineBaseAmount)).toEqual([
      "800.70",
      "0.00",
      "1000.00",
      "1650.00",
      "4000.00",
      "4050.00",
    ]);
    expect(parsed.lineItems[0]?.unitPrice).toBe("1234.56789");
    expect(parsed.baseAmount).toBe("11500.70");
    expect(parsed.reviewRequired).toBe(false);
  });

  it("leaves tables with no missing final amount unchanged", () => {
    const completeRows = positionedItems.filter(
      (item) => item.transform[5] !== 665 && item.transform[5] !== 656,
    );
    expect(preserveEmptyDiscountAmounts(completeRows)).toBeNull();
    expect(preserveEmptyDiscountAmounts([])).toBeNull();
  });

  it("keeps Russian and Ukrainian editions distinct", () => {
    const detected = detectAndParseDocument(fixture("9006"));
    const issues = detected.parsed.lineItems
      .slice(9)
      .map((line) =>
        detected.parsePublicationIssueDescription(line.description, detected.parsed.documentDate),
      );
    expect(issues.map((issue) => issue?.publicationName)).toEqual([
      "Демо.Спецвипуск (R)",
      "Демо.Спецвипуск",
      "Демо.Спецвипуск (R)",
      "Демо.Спецвипуск (R)",
    ]);
  });
});
