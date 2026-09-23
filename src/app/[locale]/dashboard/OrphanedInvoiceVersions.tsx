"use client";

import { LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { selectInvoiceVersion } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

type Version = {
  id: number;
  sourceFileName: string;
  revision: number;
  documentNumber: string;
  documentDate: string;
  supplierName: string;
  recipientName: string;
  totalAmount: string;
};

type VersionGroup = {
  key: string;
  title: string;
  versions: Version[];
};

type Labels = {
  title: string;
  description: string;
  makeCurrent: string;
  selectionFailed: string;
  revision: string;
  number: string;
  date: string;
  supplier: string;
  recipient: string;
};

export function OrphanedInvoiceVersions({
  canSelect,
  groups,
  labels,
  locale,
}: {
  canSelect: boolean;
  groups: VersionGroup[];
  labels: Labels;
  locale: AppLocale;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDocumentId, setPendingDocumentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectVersion = (documentId: number) => {
    setPendingDocumentId(documentId);
    startTransition(async () => {
      try {
        const result = await selectInvoiceVersion({ documentId, locale });
        if (result.errorKey) {
          setError(labels.selectionFailed);
          return;
        }

        setError(null);
        router.refresh();
      } catch {
        setError(labels.selectionFailed);
      } finally {
        setPendingDocumentId(null);
      }
    });
  };

  return (
    <Card className="grid gap-5 rounded-[34px] p-6">
      <div>
        <h2 className="section-title">{labels.title}</h2>
        <p className="muted">{labels.description}</p>
      </div>
      {error ? <p className="text-sm text-[color:var(--destructive)]">{error}</p> : null}
      <div className="grid gap-5">
        {groups.map((group) => (
          <section className="grid gap-3" key={group.key}>
            <h3 className="text-base font-semibold">{group.title}</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.versions.map((version) => (
                <div
                  className="grid gap-3 rounded-2xl border border-[color:var(--line)] p-4"
                  key={version.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="break-all font-semibold underline-offset-4 hover:underline"
                      href={`/dashboard/documents/${version.id}`}
                      locale={locale}
                    >
                      {version.sourceFileName}
                    </Link>
                    <span className="muted shrink-0 text-xs">
                      {labels.revision.replace("{value}", String(version.revision))}
                    </span>
                  </div>
                  <div className="grid gap-1 text-sm text-[color:var(--ink-soft)]">
                    <span>{labels.number.replace("{value}", version.documentNumber)}</span>
                    <span>{labels.date.replace("{value}", version.documentDate)}</span>
                    <span>{labels.supplier.replace("{value}", version.supplierName)}</span>
                    <span>{labels.recipient.replace("{value}", version.recipientName)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong className="tabular-nums">{version.totalAmount}</strong>
                    {canSelect ? (
                      <Button
                        disabled={isPending}
                        onClick={() => selectVersion(version.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {isPending && pendingDocumentId === version.id ? (
                          <LoaderCircle aria-hidden="true" className="animate-spin" />
                        ) : null}
                        {labels.makeCurrent}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
