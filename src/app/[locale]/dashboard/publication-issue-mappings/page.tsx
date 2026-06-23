import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { getPublicationIssueRegistry } from "@/lib/publication-mappings/queries";
import {
  searchIssueNumberCandidates,
  searchPublicationCandidates,
} from "@/lib/publication-mappings/service";
import type { PublicationIssueRegistryFilter } from "@/lib/publication-mappings/types";

import { PublicationIssueMappingsTableClient } from "./PublicationIssueMappingsTableClient";

const searchParamsSchema = z.object({
  filter: z.enum(["all", "matched", "unmatched", "document-unmatched"]).optional(),
  documentId: z.coerce.number().int().positive().optional(),
});

const baseFilterValues: PublicationIssueRegistryFilter[] = ["all", "matched", "unmatched"];

export default async function PublicationIssueMappingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const session = await auth();

  if (!session?.user) {
    redirect({ href: "/login", locale });
  }

  if (!session || session.user.role !== "ADMIN") {
    notFound();
  }

  const parsedSearchParams = searchParamsSchema.safeParse(await searchParams);
  const filter = parsedSearchParams.success ? (parsedSearchParams.data.filter ?? "all") : "all";
  const documentId = parsedSearchParams.success ? parsedSearchParams.data.documentId : undefined;
  const filterValues = documentId
    ? [...baseFilterValues, "document-unmatched" as const]
    : baseFilterValues;

  const [registry, t, common] = await Promise.all([
    getPublicationIssueRegistry(filter, documentId),
    getTranslations({ locale, namespace: "PublicationMappings" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);

  const editorEntries = await Promise.all(
    registry.map(async (item) => {
      const [publicationCandidates, issueNumberCandidates] = await Promise.all([
        searchPublicationCandidates({
          publicationIssueId: item.publicationIssueId,
        }),
        searchIssueNumberCandidates({
          publicationIssueId: item.publicationIssueId,
        }),
      ]);

      return {
        item,
        editorData: {
          publicationCandidates,
          issueNumberCandidates,
        },
      };
    }),
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Card className="grid gap-4 rounded-[34px] p-6">
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
        >
          <div>
            <Badge>{t("eyebrow")}</Badge>
            <h1
              style={{ margin: "10px 0 0", fontFamily: "var(--font-display)", fontSize: "2.3rem" }}
            >
              {t("title")}
            </h1>
            <p className="muted" style={{ margin: "10px 0 0" }}>
              {t("description")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard" locale={locale}>
              {common("backToCabinet")}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterValues.map((filterValue) => (
            <Button
              key={filterValue}
              asChild
              variant={filterValue === filter ? "default" : "outline"}
            >
              <Link
                href={{
                  pathname: "/dashboard/publication-issue-mappings",
                  query: documentId
                    ? {
                        filter: filterValue,
                        documentId,
                      }
                    : {
                        filter: filterValue,
                      },
                }}
                locale={locale}
              >
                {t(`filters.${filterValue}`)}
              </Link>
            </Button>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 rounded-[34px] p-6">
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
        >
          <strong>{t("registryTitle")}</strong>
          <Badge>{common("records", { count: registry.length })}</Badge>
        </div>

        {registry.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("emptyRegistry")}
          </p>
        ) : (
          <PublicationIssueMappingsTableClient entries={editorEntries} locale={locale} />
        )}
      </Card>
    </div>
  );
}
