import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { getMonthlyReconciliationReport } from "@/lib/reconciliation/queries";
import type { ReconciliationRow, ReconciliationSide } from "@/lib/reconciliation/types";

const formatQuantity = (formatter: Awaited<ReturnType<typeof getFormatter>>, value: string) =>
  formatter.number(Number(value), {
    maximumFractionDigits: 3,
  });

const formatMoney = (formatter: Awaited<ReturnType<typeof getFormatter>>, value: string) =>
  formatter.number(Number(value), {
    style: "currency",
    currency: "UAH",
  });

function PdfSideCells({
  formatter,
  formatCalculatedAmount,
  missingLabel,
  side,
}: {
  formatter: Awaited<ReturnType<typeof getFormatter>>;
  formatCalculatedAmount: NonNullable<
    ReconciliationSide["totalAmountCalculation"]
  > extends infer Calculation
    ? (calculation: Calculation, totalAmount: string) => string
    : never;
  missingLabel: string;
  side: ReconciliationSide | null;
}) {
  if (!side) {
    return (
      <>
        <TableCell className="muted" colSpan={3}>
          {missingLabel}
        </TableCell>
      </>
    );
  }

  return (
    <>
      <TableCell>{formatQuantity(formatter, side.quantity)}</TableCell>
      <TableCell>
        {side.prices.length > 0
          ? side.prices.map((price) => formatMoney(formatter, price)).join(", ")
          : missingLabel}
      </TableCell>
      <TableCell>
        {!side.totalAmount ? (
          missingLabel
        ) : side.totalAmountCalculation ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={formatCalculatedAmount(side.totalAmountCalculation, side.totalAmount)}
                  className="cursor-help border-b border-dotted border-[color:var(--accent)]"
                  type="button"
                >
                  {formatMoney(formatter, side.totalAmount)}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {formatCalculatedAmount(side.totalAmountCalculation, side.totalAmount)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          formatMoney(formatter, side.totalAmount)
        )}
      </TableCell>
    </>
  );
}

function ReceiptQuantityCell({
  formatter,
  missingLabel,
  side,
}: {
  formatter: Awaited<ReturnType<typeof getFormatter>>;
  missingLabel: string;
  side: ReconciliationSide | null;
}) {
  return <TableCell>{side ? formatQuantity(formatter, side.quantity) : missingLabel}</TableCell>;
}

function ReconciliationTable({
  emptyLabel,
  formatter,
  formatCalculatedAmount,
  labels,
  missingLabel,
  rows,
}: {
  emptyLabel: string;
  formatter: Awaited<ReturnType<typeof getFormatter>>;
  formatCalculatedAmount: NonNullable<
    ReconciliationSide["totalAmountCalculation"]
  > extends infer Calculation
    ? (calculation: Calculation, totalAmount: string) => string
    : never;
  labels: {
    edition: string;
    issue: string;
    periods: string;
    pdf: string;
    receipt: string;
    quantity: string;
    price: string;
    amount: string;
  };
  missingLabel: string;
  rows: ReconciliationRow[];
}) {
  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2}>{labels.edition}</TableHead>
            <TableHead rowSpan={2}>{labels.issue}</TableHead>
            <TableHead rowSpan={2}>{labels.periods}</TableHead>
            <TableHead colSpan={3} className="text-center">
              {labels.pdf}
            </TableHead>
            <TableHead className="text-center">{labels.receipt}</TableHead>
          </TableRow>
          <TableRow>
            <TableHead>{labels.quantity}</TableHead>
            <TableHead>{labels.price}</TableHead>
            <TableHead>{labels.amount}</TableHead>
            <TableHead>{labels.quantity}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell className="muted" colSpan={7}>
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={`${row.externalEditionId}:${row.externalIssueId}`}>
                <TableCell>
                  <strong>{row.externalEditionName}</strong>
                </TableCell>
                <TableCell>{row.externalIssueNumber}</TableCell>
                <TableCell className="text-sm text-[color:var(--ink-soft)]">
                  {row.receiptPeriods.length > 0 ? row.receiptPeriods.join(", ") : missingLabel}
                </TableCell>
                <PdfSideCells
                  formatter={formatter}
                  formatCalculatedAmount={formatCalculatedAmount}
                  missingLabel={missingLabel}
                  side={row.pdf}
                />
                <ReceiptQuantityCell
                  formatter={formatter}
                  missingLabel={missingLabel}
                  side={row.receipt}
                />
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableShell>
  );
}

export default async function MonthlyReconciliationPage({
  params,
}: {
  params: Promise<{ locale: string; month: string }>;
}) {
  const { locale: rawLocale, month } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const [report, t, common, formatter] = await Promise.all([
    getMonthlyReconciliationReport(month),
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "Common" }),
    getFormatter({ locale }),
  ]);

  if (!report) {
    notFound();
  }

  const tableLabels = {
    edition: t("reconciliation.table.edition"),
    issue: t("reconciliation.table.issue"),
    periods: t("reconciliation.table.periods"),
    pdf: t("reconciliation.table.pdf"),
    receipt: t("reconciliation.table.receipt"),
    quantity: t("reconciliation.table.quantity"),
    price: t("reconciliation.table.price"),
    amount: t("reconciliation.table.amount"),
  };
  const formatCalculatedAmount = (
    calculation: NonNullable<ReconciliationSide["totalAmountCalculation"]>,
    totalAmount: string,
  ) =>
    t("reconciliation.calculatedAmountFormula", {
      base: formatMoney(formatter, calculation.baseAmount),
      vat: formatMoney(formatter, calculation.vatAmount),
      total: formatMoney(formatter, totalAmount),
    });

  return (
    <div className="grid gap-6">
      <Card className="grid gap-6 rounded-[34px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--accent)] uppercase">
              {t("reconciliation.eyebrow")}
            </p>
            <h1 className="section-title text-[clamp(2.2rem,4vw,4rem)]">
              {t("reconciliation.title")}
            </h1>
            <p className="muted">
              {t("reconciliation.period", {
                period: report.externalPeriod ?? month,
              })}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard" locale={locale}>
              {common("backToCabinet")}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Badge>{t("reconciliation.mismatches", { count: report.mismatches.length })}</Badge>
          <Badge>{t("reconciliation.matches", { count: report.matches.length })}</Badge>
        </div>

        {report.externalPeriod === null ? (
          <p className="rounded-2xl border border-[color:var(--accent)] bg-[rgba(177,74,47,0.08)] px-4 py-3 text-sm">
            {t("reconciliation.externalPeriodMissing")}
          </p>
        ) : null}
      </Card>

      <Card className="grid gap-4 rounded-[34px] p-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">
            {t("reconciliation.mismatchesTitle")}
          </h2>
          <p className="muted">{t("reconciliation.mismatchesDescription")}</p>
        </div>
        <ReconciliationTable
          emptyLabel={t("reconciliation.emptyMismatches")}
          formatter={formatter}
          formatCalculatedAmount={formatCalculatedAmount}
          labels={tableLabels}
          missingLabel={t("reconciliation.missing")}
          rows={report.mismatches}
        />
      </Card>

      <Card className="grid gap-4 rounded-[34px] p-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">
            {t("reconciliation.matchesTitle")}
          </h2>
          <p className="muted">{t("reconciliation.matchesDescription")}</p>
        </div>
        <ReconciliationTable
          emptyLabel={t("reconciliation.emptyMatches")}
          formatter={formatter}
          formatCalculatedAmount={formatCalculatedAmount}
          labels={tableLabels}
          missingLabel={t("reconciliation.missing")}
          rows={report.matches}
        />
      </Card>
    </div>
  );
}
