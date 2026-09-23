"use client";

import { useState, useTransition } from "react";

import { confirmTaxInvoiceCoverage } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/routing";

type Candidate = {
  invoiceDocumentId: number;
  sourceFileName: string;
  documentNumber: string | null;
  matchedLineCount: number;
  totalLineCount: number;
};

type QueueItem = {
  taxInvoiceDocumentId: number;
  sourceFileName: string;
  documentNumber: string | null;
  candidates: Candidate[];
};

export function TaxCoverageQueueClient({
  items,
  locale,
  labels,
}: {
  items: QueueItem[];
  locale: AppLocale;
  labels: { choose: string; error: string; pending: string; noItems: string; matched: string };
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());

  const confirm = (taxInvoiceDocumentId: number, invoiceDocumentId: number) => {
    startTransition(async () => {
      const result = await confirmTaxInvoiceCoverage({
        taxInvoiceDocumentId,
        invoiceDocumentId,
        locale,
      });

      if (result.errorKey) {
        setError(labels.error);
        return;
      }

      setError(null);
      setCompleted((current) => new Set(current).add(taxInvoiceDocumentId));
    });
  };

  const activeItems = items.filter((item) => !completed.has(item.taxInvoiceDocumentId));

  if (activeItems.length === 0) {
    return <p className="muted">{labels.noItems}</p>;
  }

  return (
    <div className="grid gap-4">
      {error ? <p className="text-sm text-[color:var(--destructive)]">{error}</p> : null}
      {activeItems.map((item) => (
        <section
          className="grid gap-3 rounded-2xl border border-[color:var(--line)] p-4"
          key={item.taxInvoiceDocumentId}
        >
          <div>
            <strong>{item.documentNumber ?? item.sourceFileName}</strong>
            <p className="muted m-0">{item.sourceFileName}</p>
          </div>
          <div className="grid gap-2">
            {item.candidates.map((candidate) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[color:var(--panel-strong)] p-3"
                key={candidate.invoiceDocumentId}
              >
                <span>
                  {candidate.documentNumber ?? candidate.sourceFileName} ·{" "}
                  {candidate.matchedLineCount}/{candidate.totalLineCount}
                </span>
                <Button
                  disabled={isPending}
                  onClick={() => confirm(item.taxInvoiceDocumentId, candidate.invoiceDocumentId)}
                  size="sm"
                  type="button"
                >
                  {isPending ? labels.pending : labels.choose}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
