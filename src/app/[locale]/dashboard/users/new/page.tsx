import { UserPlus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

import { CreateUserForm } from "./CreateUserForm";

export default async function NewUserPage({
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

  if (!session?.user) {
    redirect({ href: "/login", locale });
  }

  if (!session || session.user.role !== "ADMIN") {
    notFound();
  }

  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "UserCreation" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden rounded-[34px]">
        <div className="grid xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="grid min-w-0 content-between gap-10 border-b border-[color:var(--line)] bg-[rgba(177,74,47,0.07)] p-7 xl:border-r xl:border-b-0 xl:p-9">
            <div className="grid min-w-0 gap-5">
              <Badge className="w-fit">{t("eyebrow")}</Badge>
              <div className="grid min-w-0 gap-4">
                <h1 className="m-0 max-w-full break-words font-[family-name:var(--font-display)] text-[clamp(2.25rem,4vw,4.25rem)] leading-[0.98] tracking-[-0.04em] hyphens-auto">
                  {t("title")}
                </h1>
                <p className="muted m-0 max-w-lg break-words leading-7">{t("description")}</p>
              </div>
            </div>

            <div className="flex w-full min-w-0 items-start gap-3 rounded-[22px] border border-[color:var(--line)] bg-[color:var(--panel)] p-4">
              <UserPlus className="mt-0.5 size-5 shrink-0 text-[color:var(--accent-strong)]" />
              <p className="muted m-0 min-w-0 break-words text-sm leading-6">{t("accessNote")}</p>
            </div>
          </section>

          <section className="grid min-w-0 gap-6 p-7 xl:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <strong className="text-lg">{t("formTitle")}</strong>
                <p className="muted mt-1 mb-0 break-words text-sm">{t("formDescription")}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard" locale={locale}>
                  {common("backToCabinet")}
                </Link>
              </Button>
            </div>

            <CreateUserForm />
          </section>
        </div>
      </Card>
    </div>
  );
}
