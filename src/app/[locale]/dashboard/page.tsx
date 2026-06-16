import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { DeleteDocumentButton } from "@/app/(app)/dashboard/DeleteDocumentButton";
import { UploadInvoiceForm } from "@/app/(app)/dashboard/UploadInvoiceForm";
import { Badge } from "@/components/ui/badge";
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
import type { DocumentStatus } from "@/generated/prisma/client";
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { getDashboardDocuments } from "@/lib/documents/queries";

export const dynamic = "force-dynamic";

const formatCurrency = (
  formatter: Awaited<ReturnType<typeof getFormatter>>,
  value: number | string | null,
  fallback: string,
) => {
  if (value === null) {
    return fallback;
  }

  const amount = typeof value === "number" ? value : Number(value);
  return formatter.number(amount, { style: "currency", currency: "UAH" });
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
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const format = await getFormatter({ locale });

  const statusLabel: Record<DocumentStatus, string> = {
    PENDING: t("status.PENDING"),
    PROCESSED: t("status.PROCESSED"),
    NEEDS_REVIEW: t("status.NEEDS_REVIEW"),
    FAILED: t("status.FAILED"),
  };

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
          <Badge>{common("records", { count: documents.length })}</Badge>
        </div>

        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.document")}</TableHead>
                <TableHead>{t("table.supplier")}</TableHead>
                <TableHead>{t("table.recipient")}</TableHead>
                <TableHead>{t("table.amount")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.rows")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 ? (
                <TableRow>
                  <TableCell className="muted" colSpan={7}>
                    {t("emptyRegistry")}
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <strong>
                        <Link href={`/dashboard/documents/${document.id}`} locale={locale}>
                          {formatDocumentLabel({
                            documentType: document.documentType,
                            documentNumber: document.documentNumber,
                            documentDate: document.documentDate,
                            fallback: document.sourceFileName,
                            onWord: t("documentDatePrefix"),
                          })}
                        </Link>
                      </strong>
                      <div className="muted">{document.supplier?.taxId ?? common("pending")}</div>
                    </TableCell>
                    <TableCell>{document.supplier?.name ?? common("pending")}</TableCell>
                    <TableCell>{document.recipient?.name ?? common("pending")}</TableCell>
                    <TableCell>
                      {formatCurrency(
                        format,
                        document.totalAmount?.toString() ?? null,
                        common("pending"),
                      )}
                    </TableCell>
                    <TableCell>{statusLabel[document.extractionStatus]}</TableCell>
                    <TableCell>{document._count.lineItems}</TableCell>
                    <TableCell>
                      <DeleteDocumentButton documentId={document.id} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableShell>
      </Card>
    </div>
  );
}
