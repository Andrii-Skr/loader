import { expect, it } from "vitest";
import { needsInvoiceReview } from "./integrity";
import type { ParsedLineItem } from "./types";

const row = (lineNo: number, base = "10.00", vat = "2.00") =>
  ({
    lineNo,
    lineBaseAmount: base,
    lineVatAmount: vat,
    lineTotalAmount: null,
  }) as ParsedLineItem;
const invoice = {
  lineItems: [row(1), row(2)],
  baseAmount: "20.00",
  vatAmount: "4.00",
  totalAmount: "24.00",
};
it("accepts a complete table whose amounts match the footer", () => {
  expect(needsInvoiceReview(invoice)).toBe(false);
});
it("flags a missing final row even when surviving row numbers remain consecutive", () => {
  expect(needsInvoiceReview({ ...invoice, lineItems: [row(1)] })).toBe(true);
});
it("flags a skipped or repeated row even when footer amounts happen to match", () => {
  expect(needsInvoiceReview({ ...invoice, lineItems: [row(1), row(3)] })).toBe(true);
  expect(needsInvoiceReview({ ...invoice, lineItems: [row(1), row(1)] })).toBe(true);
});
it("flags an unreadable amount instead of treating it as zero", () => {
  expect(needsInvoiceReview({ ...invoice, lineItems: [row(1, "1O.00"), row(2)] })).toBe(true);
});
it("accepts regular invoices whose VAT is present only in the footer", () => {
  expect(
    needsInvoiceReview(
      { ...invoice, lineItems: [row(1, "10.00", "0"), row(2, "10.00", "0")] },
      { lineVatAvailable: false },
    ),
  ).toBe(false);
});
it("does not compare a VAT-rate subtotal with the total base across all rates", () => {
  expect(
    needsInvoiceReview({ ...invoice, baseAmount: "10.00" }, { baseAmountIsSubtotal: true }),
  ).toBe(false);
  expect(needsInvoiceReview({ ...invoice, baseAmount: "10.00" })).toBe(true);
});
it("allows a one-cent rounding difference but flags larger differences", () => {
  expect(needsInvoiceReview({ ...invoice, totalAmount: "24.01" })).toBe(false);
  expect(needsInvoiceReview({ ...invoice, totalAmount: "24.02" })).toBe(true);
});
