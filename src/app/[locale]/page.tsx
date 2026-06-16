import { setRequestLocale } from "next-intl/server";

import { auth } from "@/auth";
import { redirect } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

export default async function LocalizedHomePage({
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

  redirect({ href: session ? "/dashboard" : "/login", locale });
}
