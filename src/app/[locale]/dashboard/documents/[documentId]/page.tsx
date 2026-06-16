import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

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
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { getDashboardDocumentById } from "@/lib/documents/queries";

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

export default async function DocumentDetailsPage({
  params,
}: {
  params: Promise<{ locale: string; documentId: string }>;
}) {
  const { locale: rawLocale, documentId } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const parsedDocumentId = z.coerce.number().int().positive().safeParse(documentId);

  if (!parsedDocumentId.success) {
    notFound();
  }

  const [document, t, common, format] = await Promise.all([
    getDashboardDocumentById(parsedDocumentId.data),
    getTranslations({ locale, namespace: "DocumentDetails" }),
    getTranslations({ locale, namespace: "Common" }),
    getFormatter({ locale }),
  ]);

  if (!document) {
    notFound();
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card className="grid gap-5 rounded-[34px] p-6">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <Badge>{t("eyebrow")}</Badge>
            <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "2.4rem" }}>
              {formatDocumentLabel({
                documentType: document.documentType,
                documentNumber: document.documentNumber,
                documentDate: document.documentDate,
                fallback: document.sourceFileName,
                onWord: t("documentDatePrefix"),
              })}
            </h1>
          </div>

          <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
            <Link href="/dashboard" locale={locale}>
              {common("backToCabinet")}
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <Card className="grid gap-2 rounded-[24px] p-5">
            <strong>{t("documentTitle")}</strong>
            <div className="muted">{document.sourceFileName}</div>
          </Card>
          <Card className="grid gap-2 rounded-[24px] p-5">
            <strong>{t("supplierTitle")}</strong>
            <div>{document.supplier?.name ?? common("pending")}</div>
            <div className="muted">{document.supplier?.taxId ?? common("pending")}</div>
          </Card>
          <Card className="grid gap-2 rounded-[24px] p-5">
            <strong>{t("recipientTitle")}</strong>
            <div>{document.recipient?.name ?? common("pending")}</div>
            <div className="muted">{document.recipient?.taxId ?? common("pending")}</div>
          </Card>
          <Card className="grid gap-2 rounded-[24px] p-5">
            <strong>{t("amountsTitle")}</strong>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                columnGap: 12,
                rowGap: 6,
                alignItems: "baseline",
              }}
            >
              <span>{t("total")}:</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(
                  format,
                  document.totalAmount?.toString() ?? null,
                  common("pending"),
                )}
              </span>
              <span>{t("vat")}:</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(format, document.vatAmount?.toString() ?? null, common("pending"))}
              </span>
              <span>{t("base")}:</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatCurrency(format, document.baseAmount?.toString() ?? null, common("pending"))}
              </span>
            </div>
          </Card>
        </div>
      </Card>

      <Card className="grid gap-4 rounded-[34px] p-6">
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
        >
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.9rem" }}>
              {t("lineItemsTitle")}
            </h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {t("lineItemsDescription")}
            </p>
          </div>
          <Badge>{common("records", { count: document.lineItems.length })}</Badge>
        </div>

        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.lineNo")}</TableHead>
                <TableHead>{t("table.description")}</TableHead>
                <TableHead>{t("table.quantity")}</TableHead>
                <TableHead>{t("table.unitPrice")}</TableHead>
                <TableHead>{t("table.baseAmount")}</TableHead>
                <TableHead>{t("table.vatAmount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.lineItems.length === 0 ? (
                <TableRow>
                  <TableCell className="muted" colSpan={6}>
                    {t("emptyLineItems")}
                  </TableCell>
                </TableRow>
              ) : (
                document.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.lineNo}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.quantity.toString()}</TableCell>
                    <TableCell>{item.unitPrice.toString()}</TableCell>
                    <TableCell>{item.lineBaseAmount.toString()}</TableCell>
                    <TableCell>{item.lineVatAmount.toString()}</TableCell>
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
