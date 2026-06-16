import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="uk"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <body className="grain">{children}</body>
    </html>
  );
}
