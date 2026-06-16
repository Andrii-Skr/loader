import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export const proxy = auth((request: NextRequest & { auth?: unknown }) => {
  const pathname = request.nextUrl.pathname;
  const response = intlMiddleware(request);
  const [, maybeLocale] = pathname.split("/");
  const locale = routing.locales.includes(maybeLocale as AppLocale)
    ? (maybeLocale as AppLocale)
    : routing.defaultLocale;
  const isProtected =
    pathname === `/${locale}/dashboard` || pathname.startsWith(`/${locale}/dashboard/`);

  if (!request.auth && isProtected) {
    const loginUrl = new URL(`/${locale}/login`, request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
