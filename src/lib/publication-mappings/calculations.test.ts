import { expect, it } from "vitest";
import {
  calculateAllocationAmounts,
  getRemainingAllocationQuantity,
  summarizeAllocationDrafts,
} from "./calculations";
it("rounds base and VAT separately and uses the same total in the preview", () => {
  expect(
    calculateAllocationAmounts({ quantity: "0.5", unitPrice: "1.05", vatRate: "20%" }),
  ).toEqual({ lineBaseAmount: "0.53", lineVatAmount: "0.11", lineTotalAmount: "0.64" });
  expect(
    summarizeAllocationDrafts([{ quantity: "0.5", unitPrice: "1.05" }], "20%", {
      lineBaseAmount: "0.53",
      lineVatAmount: "0.11",
      lineTotalAmount: "0.64",
    }),
  ).toEqual({ quantity: "0.5", totalAmount: "0.64", hasMoneyWarning: false });
});
it("adds decimal quantities and totals exactly", () => {
  expect(
    summarizeAllocationDrafts(
      [
        { quantity: "0.1", unitPrice: "1.00" },
        { quantity: "0.7", unitPrice: "1.00" },
      ],
      null,
      { lineBaseAmount: "0.80", lineVatAmount: "0.00", lineTotalAmount: null },
    ),
  ).toEqual({ quantity: "0.8", totalAmount: "0.80", hasMoneyWarning: false });
});
it("does not crash while the user is typing", () => {
  expect(
    summarizeAllocationDrafts([{ quantity: "", unitPrice: "-" }], "20", {
      lineBaseAmount: "1.00",
      lineVatAmount: "0.20",
      lineTotalAmount: null,
    }),
  ).toEqual({ quantity: "0", totalAmount: "0.00", hasMoneyWarning: true });
});

it.each([
  ["23.55", ["20"], "3.55"],
  ["23.55", ["10", "10", "1.005"], "2.545"],
  ["0.3", ["0.1", "0.1"], "0.1"],
  ["23.55", ["23.55"], ""],
  ["23.55", ["30"], ""],
  ["23.55", ["", "20"], "3.55"],
  ["23.55", ["invalid"], ""],
  ["23.55", ["0.0001"], ""],
  ["999999999999.999", ["999999999999.998"], "0.001"],
  ["23.55", [], "23.55"],
] as const)("calculates the remaining quantity for %s minus %j", (source, quantities, expected) => {
  expect(
    getRemainingAllocationQuantity(
      source,
      quantities.map((quantity) => ({ quantity })),
    ),
  ).toBe(expected);
});
