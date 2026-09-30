import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketplace — Temukan favorit barumu",
  description: "Toko online barang jastip dan impor dengan palet pink dan ivory.",
};

export const viewport: Viewport = {
  themeColor: "#f7b8c7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
