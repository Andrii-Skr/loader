import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function LocalizedNotFound() {
  const rawLocale = await getLocale();
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Common" });

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="panel" style={{ borderRadius: 32, padding: 28, textAlign: "center" }}>
        <h1 className="section-title" style={{ fontSize: "3rem", marginBottom: 16 }}>
          404
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("pageNotFound")}
        </p>
        <Link className={buttonVariants()} href="/login" locale={locale}>
          {t("backToCabinet")}
        </Link>
      </div>
    </main>
  );
}
