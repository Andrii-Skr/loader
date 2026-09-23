import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function LocalizedNotFound() {
  const rawLocale = await getLocale();
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([
    getTranslations({ locale, namespace: "Common" }),
    auth(),
  ]);
  const href = session ? "/dashboard" : "/login";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="panel" style={{ borderRadius: 32, padding: 28, textAlign: "center" }}>
        <h1 className="section-title" style={{ fontSize: "3rem", marginBottom: 16 }}>
          404
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("pageNotFound")}
        </p>
        <Link className={buttonVariants()} href={href} locale={locale}>
          {session ? t("goToDashboard") : t("goToLogin")}
        </Link>
      </div>
    </main>
  );
}
