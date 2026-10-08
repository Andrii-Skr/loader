import Decimal from "decimal.js";
import type { ParsedVatInvoice } from "./types";

const ExactDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type InvoiceAmounts = Pick<
  ParsedVatInvoice,
  "lineItems" | "baseAmount" | "vatAmount" | "totalAmount"
>;

export const needsInvoiceReview = (
  invoice: InvoiceAmounts,
  options: { lineVatAvailable?: boolean; baseAmountIsSubtotal?: boolean } = {},
): boolean => {
  if (invoice.lineItems.length === 0) return true;
  const money = (value: string) => {
    const amount = new ExactDecimal(value);
    if (!amount.isFinite()) throw new Error("Invalid amount");
    return amount.toDecimalPlaces(2);
  };
  const differs = (left: Decimal, right: Decimal) => left.minus(right).abs().gt("0.01");
  try {
    let base = new ExactDecimal(0);
    let vat = new ExactDecimal(0);
    let total = new ExactDecimal(0);
    for (const [index, line] of invoice.lineItems.entries()) {
      if (line.lineNo !== index + 1) return true;
      const lineBase = money(line.lineBaseAmount);
      const lineVat = money(line.lineVatAmount);
      base = base.plus(lineBase);
      vat = vat.plus(lineVat);
      total = total.plus(
        line.lineTotalAmount === null ? lineBase.plus(lineVat) : money(line.lineTotalAmount),
      );
    }
    if (
      !options.baseAmountIsSubtotal &&
      invoice.baseAmount !== null &&
      differs(base, money(invoice.baseAmount))
    )
      return true;
    if (options.lineVatAvailable === false) {
      // Regular UA invoices provide VAT in the footer, rather than on each parsed row.
      total = base.plus(invoice.vatAmount === null ? 0 : money(invoice.vatAmount));
    } else if (invoice.vatAmount !== null && differs(vat, money(invoice.vatAmount))) {
      return true;
    }
    return differs(total, money(invoice.totalAmount));
  } catch {
    return true;
  }
};
