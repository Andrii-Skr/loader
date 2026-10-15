import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";
import { getCounterpartyDirectory } from "@/lib/counterparties/manage";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CounterpartyDirectoryClient } from "./CounterpartyDirectoryClient";

export default async function CounterpartiesPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = routing.locales.includes(raw as AppLocale)
    ? (raw as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user) redirect({ href: "/login", locale });
  const [t, entries] = await Promise.all([
    getTranslations({ locale, namespace: "Counterparties" }),
    getCounterpartyDirectory(),
  ]);
  return (
    <Card className="grid min-w-0 gap-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">{t("title")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Link className="text-sm underline" href="/dashboard">
          {t("back")}
        </Link>
      </div>
      <CounterpartyDirectoryClient entries={entries} />
    </Card>
  );
}
