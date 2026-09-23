import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function GlobalNotFound() {
  const rawLocale = await getLocale();
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const [t, session] = await Promise.all([
    getTranslations({ locale, namespace: "Common" }),
    auth(),
  ]);
  const href = session ? `/${locale}/dashboard` : `/${locale}/login`;

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="panel grid gap-5 rounded-[32px] p-7 text-center">
        <h1 className="section-title text-5xl">404</h1>
        <p className="muted m-0">{t("pageNotFound")}</p>
        <Link className={buttonVariants()} href={href}>
          {session ? t("goToDashboard") : t("goToLogin")}
        </Link>
      </div>
    </main>
  );
}
