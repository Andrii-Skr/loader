import { getTranslations, setRequestLocale } from "next-intl/server";

import { LoginForm } from "@/app/(auth)/login/LoginForm";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function LocalizedLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  setRequestLocale(locale);

  const session = await auth();

  if (session) {
    redirect({ href: "/dashboard", locale });
  }

  const t = await getTranslations({ locale, namespace: "Login" });
  const common = await getTranslations({ locale, namespace: "Common" });

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="shell grid w-full gap-6 rounded-[36px] p-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <section className="grid content-between gap-5">
          <div style={{ display: "grid", gap: 18 }}>
            <span className="eyebrow">{common("restrictedRoom")}</span>
            <h1 className="section-title" style={{ fontSize: "clamp(2.8rem, 5vw, 5rem)" }}>
              {t("titleLine1")}
              <br />
              {t("titleLine2")}
              <br />
              {t("titleLine3")}
            </h1>
            <p className="muted" style={{ maxWidth: 470, margin: 0, lineHeight: 1.7 }}>
              {t("description")}
            </p>
          </div>
        </section>

        <section className="rounded-[30px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] p-6">
          <div style={{ display: "grid", gap: 14, marginBottom: 18 }}>
            <strong style={{ fontSize: "1.15rem" }}>{t("formTitle")}</strong>
            <span className="muted">{t("formDescription")}</span>
          </div>
          <LoginForm locale={locale} />
        </section>
      </Card>
    </main>
  );
}
