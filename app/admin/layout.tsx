import type { Metadata } from "next";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import "./admin.css";

export const metadata: Metadata = {
  title: t("admin.meta.title"),
  description: t("admin.meta.description"),
  robots: { index: false, follow: false },
};

// Shared by the login page and the panel. The access check lives in (panel)/layout.tsx so the login page stays reachable.
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="admin">{children}</div>;
}
