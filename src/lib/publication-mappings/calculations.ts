import Decimal from "decimal.js";
import { unitPriceSchema } from "./price";
import { quantitySchema } from "./quantity";

const ExactDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const calculateAllocationAmounts = ({
  quantity,
  unitPrice,
  vatRate,
}: {
  quantity: string;
  unitPrice: string;
  vatRate: string | null;
}) => {
  const rate = vatRate?.replace(",", ".").match(/\d+(?:\.\d+)?/u)?.[0] ?? "0";
  const base = new ExactDecimal(quantity).mul(unitPrice).toDecimalPlaces(2);
  const vat = base.mul(rate).div(100).toDecimalPlaces(2);
  return {
    lineBaseAmount: base.toFixed(2),
    lineVatAmount: vat.toFixed(2),
    lineTotalAmount: base.plus(vat).toFixed(2),
  };
};

export const summarizeAllocationDrafts = (
  drafts: Array<{ quantity: string; unitPrice: string }>,
  vatRate: string | null,
  source: { lineBaseAmount: string; lineVatAmount: string; lineTotalAmount: string | null },
) => {
  let quantity = new ExactDecimal(0);
  let total = new ExactDecimal(0);
  for (const draft of drafts) {
    const parsedQuantity = quantitySchema("invalid").safeParse(draft.quantity);
    const parsedPrice = unitPriceSchema("invalid").safeParse(draft.unitPrice);
    if (!parsedQuantity.success) continue;
    quantity = quantity.plus(parsedQuantity.data);
    if (!parsedPrice.success) continue;
    total = total.plus(
      calculateAllocationAmounts({
        quantity: parsedQuantity.data,
        unitPrice: parsedPrice.data,
        vatRate,
      }).lineTotalAmount,
    );
  }
  const sourceTotal =
    source.lineTotalAmount === null
      ? new ExactDecimal(source.lineBaseAmount).plus(source.lineVatAmount)
      : new ExactDecimal(source.lineTotalAmount);
  return {
    quantity: quantity.toString(),
    totalAmount: total.toFixed(2),
    hasMoneyWarning: total.minus(sourceTotal).abs().gt("0.009"),
  };
};
