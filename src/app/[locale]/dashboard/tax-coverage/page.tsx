import { getTranslations, setRequestLocale } from "next-intl/server";

import { TaxCoverageQueueClient } from "@/app/[locale]/dashboard/tax-coverage/TaxCoverageQueueClient";
import { Card } from "@/components/ui/card";
import { TaxCoverageStatus } from "@/generated/prisma/client";
import { type AppLocale, routing } from "@/i18n/routing";
import { getTaxCoverageCandidates } from "@/lib/documents/tax-coverage";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TaxCoverageQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const [t, taxInvoices] = await Promise.all([
    getTranslations({ locale, namespace: "TaxCoverage" }),
    prisma.document.findMany({
      where: {
        documentTypeId: 1,
        isCurrent: true,
        taxCoverageStatus: TaxCoverageStatus.NEEDS_SELECTION,
      },
      select: { id: true, sourceFileName: true, documentNumber: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const candidates = await Promise.all(
    taxInvoices.map((item) => getTaxCoverageCandidates(item.id)),
  );

  return (
    <Card className="grid gap-5 rounded-[34px] p-6">
      <div>
        <h1 className="section-title">{t("title")}</h1>
        <p className="muted">{t("description")}</p>
      </div>
      <TaxCoverageQueueClient
        items={taxInvoices.map((item, index) => ({
          taxInvoiceDocumentId: item.id,
          sourceFileName: item.sourceFileName,
          documentNumber: item.documentNumber,
          candidates: (candidates[index] ?? []).map((candidate) => ({
            invoiceDocumentId: candidate.invoiceDocumentId,
            sourceFileName: candidate.sourceFileName,
            documentNumber: candidate.documentNumber,
            matchedLineCount: candidate.matchedLineCount,
            totalLineCount: candidate.totalLineCount,
          })),
        }))}
        labels={{
          choose: t("choose"),
          error: t("error"),
          pending: t("pending"),
          noItems: t("noItems"),
          matched: t("matched"),
        }}
        locale={locale}
      />
    </Card>
  );
}
