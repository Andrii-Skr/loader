import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { Commissioner, Prata } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";

const displayFont = Prata({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Commissioner({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PDF Loader",
  description: "Internal loader for PDF invoice extraction into PostgreSQL.",
  applicationName: "PDF Loader",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "PDF Loader",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3EADB" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <body className="grain">{children}</body>
    </html>
  );
}
