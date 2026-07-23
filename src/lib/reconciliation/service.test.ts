import { describe, expect, it } from "vitest";

import { parseReconciliationMonthKey } from "@/lib/reconciliation/period";
import {
  buildMonthlyReconciliationReport,
  normalizePdfRowForSupplier,
} from "@/lib/reconciliation/service";
import type { ReconciliationSourceRow } from "@/lib/reconciliation/types";

const pdfRow: ReconciliationSourceRow = {
  externalEditionId: 11,
  externalEditionName: "Газета",
  externalIssueId: 42,
  externalIssueNumber: "4",
  quantity: "100",
  unitPrice: "12.5",
  lineTotalAmount: "1250",
};

describe("buildMonthlyReconciliationReport", () => {
  it("puts equal normalized values into matches", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [
        { ...pdfRow, quantity: "100.0004", unitPrice: "12.504", lineTotalAmount: "1250.004" },
      ],
      receiptRows: [pdfRow],
    });

    expect(report.matches).toHaveLength(1);
    expect(report.mismatches).toEqual([]);
  });

  it("keeps a quantity difference in mismatches", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [pdfRow],
      receiptRows: [{ ...pdfRow, quantity: "101" }],
    });

    expect(report.mismatches).toHaveLength(1);
    expect(report.matches).toEqual([]);
  });

  it("matches equal quantities despite different price and amount", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [pdfRow],
      receiptRows: [{ ...pdfRow, unitPrice: "27", lineTotalAmount: "2700" }],
    });

    expect(report.matches).toHaveLength(1);
    expect(report.mismatches).toEqual([]);
  });

  it("keeps one-sided rows in mismatches", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [pdfRow],
      receiptRows: [],
    });

    expect(report.mismatches[0]).toMatchObject({ pdf: expect.any(Object), receipt: null });
  });

  it("does not include receipt-only rows in a PDF-driven report", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [],
      receiptRows: [pdfRow],
    });

    expect(report.mismatches).toEqual([]);
    expect(report.matches).toEqual([]);
  });

  it("aggregates rows by edition and issue and compares all prices", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [pdfRow, { ...pdfRow, quantity: "20", unitPrice: "13", lineTotalAmount: "260" }],
      receiptRows: [
        { ...pdfRow, quantity: "100", unitPrice: "12.5", lineTotalAmount: "1250" },
        { ...pdfRow, quantity: "20", unitPrice: "13", lineTotalAmount: "260" },
      ],
    });

    expect(report.matches[0]).toMatchObject({
      pdf: { quantity: "120.000", prices: ["12.50", "13.00"], totalAmount: "1510.00" },
    });
  });

  it("keeps the adjacent receipt periods in the aggregated report row", () => {
    const report = buildMonthlyReconciliationReport({
      monthKey: "2026-04",
      externalPeriod: "2026 апрель",
      pdfRows: [pdfRow],
      receiptRows: [
        { ...pdfRow, receiptPeriodCode: 230, receiptPeriod: "2026 март" },
        { ...pdfRow, receiptPeriodCode: 231, receiptPeriod: "2026 апрель" },
        { ...pdfRow, receiptPeriodCode: 232, receiptPeriod: "2026 май" },
      ],
    });

    expect(report.mismatches[0]?.receiptPeriods).toEqual(["2026 март", "2026 апрель", "2026 май"]);
  });
});

describe("normalizePdfRowForSupplier", () => {
  it("rescales Volynska Drukarnia quantities and prices without changing the total", () => {
    expect(
      normalizePdfRowForSupplier({
        row: pdfRow,
        supplierName: 'ПРИВАТНЕ ПІДПРИЄМСТВО "ВОЛИНСЬКА ДРУКАРНЯ"',
      }),
    ).toMatchObject({
      quantity: "100000",
      unitPrice: "0.0125",
      lineTotalAmount: "1250",
    });
  });

  it("does not change rows from other suppliers", () => {
    expect(
      normalizePdfRowForSupplier({
        row: pdfRow,
        supplierName: "Інша друкарня",
      }),
    ).toEqual(pdfRow);
  });

  it("calculates a missing PDF amount from quantity and price", () => {
    expect(
      normalizePdfRowForSupplier({
        row: { ...pdfRow, quantity: "0.5", unitPrice: "17750", lineTotalAmount: null },
        supplierName: "Інша друкарня",
      }),
    ).toMatchObject({ lineTotalAmount: "8875", isCalculatedTotal: true });
  });

  it("adds VAT when calculating a missing PDF amount", () => {
    expect(
      normalizePdfRowForSupplier({
        row: {
          ...pdfRow,
          quantity: "0.5",
          unitPrice: "17750",
          lineTotalAmount: null,
          lineVatAmount: "1775",
        },
        supplierName: "Інша друкарня",
      }),
    ).toMatchObject({ lineTotalAmount: "10650", isCalculatedTotal: true });
  });
});

describe("parseReconciliationMonthKey", () => {
  it("maps a calendar key to the external period and UTC boundaries", () => {
    expect(parseReconciliationMonthKey("2026-04")).toMatchObject({
      externalPeriod: "2026 апрель",
      start: new Date(Date.UTC(2026, 3, 1)),
      end: new Date(Date.UTC(2026, 4, 1)),
    });
  });

  it("rejects invalid month keys", () => {
    expect(parseReconciliationMonthKey("2026-13")).toBeNull();
    expect(parseReconciliationMonthKey("April 2026")).toBeNull();
  });
});
