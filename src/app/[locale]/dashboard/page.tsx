import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { UploadInvoiceForm } from "@/app/(app)/dashboard/UploadInvoiceForm";
import { DocumentRegistry } from "@/app/[locale]/dashboard/DocumentRegistry";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import type { MappingStatusKey } from "@/lib/documents/mapping-status";
import { getDashboardDocuments } from "@/lib/documents/queries";
import { splitRegistryDocuments } from "@/lib/documents/registry";

export const dynamic = "force-dynamic";

const formatCurrency = (
  formatter: Awaited<ReturnType<typeof getFormatter>>,
  value: number | string | null,
  currency: string | null,
  contour: string | null,
  fallback: string,
) => {
  if (value === null) {
    return fallback;
  }

  const amount = typeof value === "number" ? value : Number(value);
  const resolvedCurrency = contour === "RU" ? "RUB" : (currency ?? "UAH");

  return formatter.number(amount, { style: "currency", currency: resolvedCurrency });
};

const formatDocumentLabel = ({
  documentType,
  documentNumber,
  documentDate,
  fallback,
  onWord,
}: {
  documentType: string | null;
  documentNumber: string | null;
  documentDate: Date | null;
  fallback: string;
  onWord: string;
}) => {
  if (!documentType || !documentNumber || !documentDate) {
    return fallback;
  }

  const day = String(documentDate.getUTCDate()).padStart(2, "0");
  const month = String(documentDate.getUTCMonth() + 1).padStart(2, "0");
  const year = documentDate.getUTCFullYear();

  return `${documentType} № ${documentNumber} ${onWord} ${day}.${month}.${year}`;
};

export default async function LocalizedDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const documents = await getDashboardDocuments();
  const [session, t, documentDetails, common, format] = await Promise.all([
    auth(),
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "DocumentDetails" }),
    getTranslations({ locale, namespace: "Common" }),
    getFormatter({ locale }),
  ]);
  const canManageMappings = session?.user?.role === "ADMIN";

  const mappingStatusLabels: Record<MappingStatusKey, string> = {
    unparsed: documentDetails("mappingStatus.unparsed"),
    unmatched: documentDetails("mappingStatus.unmatched"),
    partiallyMatched: documentDetails("mappingStatus.partiallyMatched"),
    fullyMatched: documentDetails("mappingStatus.fullyMatched"),
  };

  const serializedDocuments = documents.map((document) => ({
    id: document.id,
    label: formatDocumentLabel({
      documentType: document.documentType,
      documentNumber: document.documentNumber,
      documentDate: document.documentDate,
      fallback: document.sourceFileName,
      onWord: t("documentDatePrefix"),
    }),
    supplierTaxId: document.supplier?.taxId ?? null,
    supplierName: document.supplier?.name ?? null,
    recipientName: document.recipient?.name ?? null,
    totalAmount: formatCurrency(
      format,
      document.totalAmount?.toString() ?? null,
      document.currency,
      document.documentContour,
      common("pending"),
    ),
    mappingStatus: document.mappingStatus,
    lineItemsCount: document._count.lineItems,
    documentDate: document.documentDate,
  }));

  const { actionableDocuments, completedGroups } = splitRegistryDocuments({
    documents: serializedDocuments,
    locale,
    undatedTitle: t("completedUndatedMonth"),
  });

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card className="grid gap-6 rounded-[34px] p-[26px]">
        <div style={{ display: "grid", gap: 8 }}>
          <h1 className="section-title" style={{ fontSize: "clamp(2.2rem, 4vw, 4rem)" }}>
            {t("titleLine1")}
            {t("titleLine2") ? (
              <>
                <br />
                {t("titleLine2")}
              </>
            ) : null}
          </h1>
        </div>

        <div
          style={{
            padding: 22,
            borderRadius: 28,
            background: "var(--panel-strong)",
            border: "1px solid var(--line)",
          }}
        >
          <UploadInvoiceForm />
        </div>
      </Card>

      <Card className="grid gap-[18px] rounded-[34px] p-6">
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
        >
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "2rem" }}>
              {t("registryTitle")}
            </h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {t("registryDescription")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{common("records", { count: documents.length })}</Badge>
            {canManageMappings ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={{
                    pathname: "/dashboard/publication-issue-mappings",
                    query: { filter: "unmatched" },
                  }}
                  locale={locale}
                >
                  {common("editionMappings")}
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <DocumentRegistry
          actionableDocuments={actionableDocuments}
          actionableSectionTitle={t("actionableSectionTitle")}
          completedGroups={completedGroups}
          completedMonthToggleLabel={t("completedMonthToggle")}
          completedSectionTitle={t("completedSectionTitle")}
          emptyRegistryLabel={t("emptyRegistry")}
          locale={locale}
          mappingStatusLabels={mappingStatusLabels}
          pendingLabel={common("pending")}
          tableLabels={{
            document: t("table.document"),
            supplier: t("table.supplier"),
            recipient: t("table.recipient"),
            amount: t("table.amount"),
            status: t("table.status"),
            rows: t("table.rows"),
            actions: t("table.actions"),
          }}
        />
      </Card>
    </div>
  );
}
