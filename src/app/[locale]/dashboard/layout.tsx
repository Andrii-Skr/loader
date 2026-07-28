import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { HeaderControls } from "@/components/layout/header-controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function LocalizedDashboardLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const session = await auth();
  const user = session?.user;

  if (!user) {
    redirect({ href: "/login", locale });
    return null;
  }

  const userLabel = user.name ?? user.login ?? "Unknown";
  const roleLabel = (user.role ?? "OPERATOR").toLowerCase();

  const common = await getTranslations({ locale, namespace: "Common" });

  return (
    <div style={{ minHeight: "100vh", padding: "24px 0 40px" }}>
      <div className="shell" style={{ display: "grid", gap: 18 }}>
        <Card className="flex flex-wrap items-center justify-between gap-4 rounded-[30px] px-[22px] py-[18px]">
          <div style={{ display: "grid", gap: 4 }}>
            <Link
              href="/dashboard"
              locale={locale}
              style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem" }}
            >
              {common("appName")}
            </Link>
            <span className="muted">
              {userLabel} · {roleLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <HeaderControls
              currentLocale={locale}
              headerControlsLabel={common("headerControlsLabel")}
              languageLabel={common("language")}
              localeLabels={{
                en: common("localeEn"),
                ru: common("localeRu"),
                uk: common("localeUk"),
              }}
              themeLabel={common("theme")}
              themeLabels={{
                dark: common("themeDark"),
                light: common("themeLight"),
                system: common("themeSystem"),
              }}
            />
            {user.role === "ADMIN" ? (
              <div className="header-control header-control--action">
                <div className="header-control__segmented header-control__segmented--action">
                  <Button
                    asChild
                    className="header-control__chip header-control__chip--action"
                    variant="ghost"
                  >
                    <Link href="/dashboard/users/new" locale={locale}>
                      {common("addUser")}
                    </Link>
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="header-control header-control--action">
              <div className="header-control__segmented header-control__segmented--action">
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: `/${locale}/login` });
                  }}
                >
                  <Button
                    className="header-control__chip header-control__chip--action"
                    type="submit"
                    variant="ghost"
                  >
                    {common("logout")}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </Card>
        {children}
      </div>
    </div>
  );
}
