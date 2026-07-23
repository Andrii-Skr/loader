export type ReconciliationSide = {
  quantity: string;
  prices: string[];
  totalAmount: string | null;
  totalAmountCalculation: {
    baseAmount: string;
    vatAmount: string;
  } | null;
};

export type ReconciliationRow = {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number;
  externalIssueNumber: string;
  receiptPeriods: string[];
  pdf: ReconciliationSide | null;
  receipt: ReconciliationSide | null;
  isMatch: boolean;
};

export type MonthlyReconciliationReport = {
  monthKey: string;
  externalPeriod: string | null;
  mismatches: ReconciliationRow[];
  matches: ReconciliationRow[];
};

export type ReconciliationSourceRow = {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number;
  externalIssueNumber: string;
  quantity: string;
  unitPrice: string | null;
  lineTotalAmount: string | null;
  lineVatAmount?: string | null;
  isCalculatedTotal?: boolean;
  receiptPeriodCode?: number;
  receiptPeriod?: string;
};
