import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  // Relative links in link previews and canonical addresses are made absolute against this.
  metadataBase: new URL(siteUrl()),
  title: t("store.meta.title"),
  description: t("store.meta.description"),
};

export const viewport: Viewport = {
  themeColor: "#f7b8c7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
