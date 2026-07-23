import { Prisma } from "@/generated/prisma/client";

import type {
  MonthlyReconciliationReport,
  ReconciliationRow,
  ReconciliationSide,
  ReconciliationSourceRow,
} from "@/lib/reconciliation/types";

const QUANTITY_DECIMAL_PLACES = 3;
const MONEY_DECIMAL_PLACES = 2;
const VOLYNSKA_DRUKARNIA_NAME = "ВОЛИНСЬКА ДРУКАРНЯ";

const toNormalizedDecimal = (value: string, decimalPlaces: number) =>
  new Prisma.Decimal(value).toDecimalPlaces(decimalPlaces).toFixed(decimalPlaces);

const sourceRowKey = (row: ReconciliationSourceRow) =>
  `${row.externalEditionId}:${row.externalIssueId}`;

export const normalizePdfRowForSupplier = ({
  row,
  supplierName,
}: {
  row: ReconciliationSourceRow;
  supplierName: string | null;
}): ReconciliationSourceRow => {
  const isVolynskaDrukarnia = supplierName
    ?.toLocaleUpperCase("uk-UA")
    .includes(VOLYNSKA_DRUKARNIA_NAME);
  const baseAmount =
    row.unitPrice === null ? null : new Prisma.Decimal(row.quantity).times(row.unitPrice);
  const isCalculatedTotal = row.lineTotalAmount === null && baseAmount !== null;
  const lineTotalAmount = isCalculatedTotal
    ? baseAmount.plus(row.lineVatAmount ?? 0).toString()
    : row.lineTotalAmount;
  const totalAmountFields = isCalculatedTotal
    ? { lineTotalAmount, isCalculatedTotal: true }
    : { lineTotalAmount };

  if (!isVolynskaDrukarnia) {
    return { ...row, ...totalAmountFields };
  }

  return {
    ...row,
    ...totalAmountFields,
    quantity: new Prisma.Decimal(row.quantity).times(1000).toString(),
    unitPrice:
      row.unitPrice === null ? null : new Prisma.Decimal(row.unitPrice).dividedBy(1000).toString(),
  };
};

type AggregatedSide = ReconciliationSide & {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number;
  externalIssueNumber: string;
  hasMissingPrice: boolean;
  receiptPeriods: string[];
};

const aggregateRows = (rows: ReconciliationSourceRow[]) => {
  const grouped = new Map<
    string,
    {
      externalEditionId: number;
      externalEditionName: string;
      externalIssueId: number;
      externalIssueNumber: string;
      quantity: Prisma.Decimal;
      prices: Set<string>;
      totalAmount: Prisma.Decimal;
      hasMissingAmount: boolean;
      hasMissingPrice: boolean;
      calculatedBaseAmount: Prisma.Decimal;
      calculatedVatAmount: Prisma.Decimal;
      hasCalculatedAmount: boolean;
      hasStoredAmount: boolean;
      receiptPeriods: Map<number, string>;
    }
  >();

  for (const row of rows) {
    const key = sourceRowKey(row);
    const existing = grouped.get(key);
    const entry = existing ?? {
      externalEditionId: row.externalEditionId,
      externalEditionName: row.externalEditionName,
      externalIssueId: row.externalIssueId,
      externalIssueNumber: row.externalIssueNumber,
      quantity: new Prisma.Decimal(0),
      prices: new Set<string>(),
      totalAmount: new Prisma.Decimal(0),
      hasMissingAmount: false,
      hasMissingPrice: false,
      calculatedBaseAmount: new Prisma.Decimal(0),
      calculatedVatAmount: new Prisma.Decimal(0),
      hasCalculatedAmount: false,
      hasStoredAmount: false,
      receiptPeriods: new Map<number, string>(),
    };

    entry.quantity = entry.quantity.plus(row.quantity);

    if (row.receiptPeriodCode !== undefined && row.receiptPeriod !== undefined) {
      entry.receiptPeriods.set(row.receiptPeriodCode, row.receiptPeriod);
    }

    if (row.unitPrice === null) {
      entry.hasMissingPrice = true;
    } else {
      entry.prices.add(toNormalizedDecimal(row.unitPrice, MONEY_DECIMAL_PLACES));
    }

    if (row.lineTotalAmount === null) {
      entry.hasMissingAmount = true;
    } else {
      entry.totalAmount = entry.totalAmount.plus(row.lineTotalAmount);

      if (row.isCalculatedTotal && row.unitPrice !== null) {
        entry.hasCalculatedAmount = true;
        entry.calculatedBaseAmount = entry.calculatedBaseAmount.plus(
          new Prisma.Decimal(row.quantity).times(row.unitPrice),
        );
        entry.calculatedVatAmount = entry.calculatedVatAmount.plus(row.lineVatAmount ?? 0);
      } else {
        entry.hasStoredAmount = true;
      }
    }

    grouped.set(key, entry);
  }

  return new Map<string, AggregatedSide>(
    Array.from(grouped, ([key, entry]) => [
      key,
      {
        externalEditionId: entry.externalEditionId,
        externalEditionName: entry.externalEditionName,
        externalIssueId: entry.externalIssueId,
        externalIssueNumber: entry.externalIssueNumber,
        quantity: entry.quantity
          .toDecimalPlaces(QUANTITY_DECIMAL_PLACES)
          .toFixed(QUANTITY_DECIMAL_PLACES),
        prices: Array.from(entry.prices).sort((left, right) => left.localeCompare(right, "en")),
        totalAmount: entry.hasMissingAmount
          ? null
          : entry.totalAmount.toDecimalPlaces(MONEY_DECIMAL_PLACES).toFixed(MONEY_DECIMAL_PLACES),
        totalAmountCalculation:
          entry.hasCalculatedAmount && !entry.hasStoredAmount && !entry.hasMissingAmount
            ? {
                baseAmount: entry.calculatedBaseAmount
                  .toDecimalPlaces(MONEY_DECIMAL_PLACES)
                  .toFixed(MONEY_DECIMAL_PLACES),
                vatAmount: entry.calculatedVatAmount
                  .toDecimalPlaces(MONEY_DECIMAL_PLACES)
                  .toFixed(MONEY_DECIMAL_PLACES),
              }
            : null,
        hasMissingPrice: entry.hasMissingPrice,
        receiptPeriods: Array.from(entry.receiptPeriods.entries())
          .sort(([left], [right]) => left - right)
          .map(([, period]) => period),
      },
    ]),
  );
};

const sideMatches = (left: AggregatedSide | null, right: AggregatedSide | null) => {
  if (!left || !right) {
    return false;
  }

  return left.quantity === right.quantity;
};

const toPublicSide = (side: AggregatedSide | null): ReconciliationSide | null => {
  if (!side) {
    return null;
  }

  return {
    quantity: side.quantity,
    prices: side.prices,
    totalAmount: side.totalAmount,
    totalAmountCalculation: side.totalAmountCalculation,
  };
};

export const buildMonthlyReconciliationReport = ({
  monthKey,
  externalPeriod,
  pdfRows,
  receiptRows,
}: {
  monthKey: string;
  externalPeriod: string | null;
  pdfRows: ReconciliationSourceRow[];
  receiptRows: ReconciliationSourceRow[];
}): MonthlyReconciliationReport => {
  const pdfByKey = aggregateRows(pdfRows);
  const receiptByKey = aggregateRows(receiptRows);
  const rows: ReconciliationRow[] = [];

  for (const key of pdfByKey.keys()) {
    const pdf = pdfByKey.get(key) ?? null;
    const receipt = receiptByKey.get(key) ?? null;
    const source = pdf ?? receipt;

    if (!source) {
      continue;
    }

    rows.push({
      externalEditionId: source.externalEditionId,
      externalEditionName: source.externalEditionName,
      externalIssueId: source.externalIssueId,
      externalIssueNumber: source.externalIssueNumber,
      receiptPeriods: receipt?.receiptPeriods ?? [],
      pdf: toPublicSide(pdf),
      receipt: toPublicSide(receipt),
      isMatch: sideMatches(pdf, receipt),
    });
  }

  rows.sort(
    (left, right) =>
      left.externalEditionName.localeCompare(right.externalEditionName, "uk-UA") ||
      left.externalIssueNumber.localeCompare(right.externalIssueNumber, "uk-UA") ||
      left.externalEditionId - right.externalEditionId ||
      left.externalIssueId - right.externalIssueId,
  );

  return {
    monthKey,
    externalPeriod,
    mismatches: rows.filter((row) => !row.isMatch),
    matches: rows.filter((row) => row.isMatch),
  };
};
