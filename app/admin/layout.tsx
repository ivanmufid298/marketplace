import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminTemplate } from "@/components/templates/admin-template";
import { t } from "@/lib/i18n";
import "./admin.css";

export const metadata: Metadata = {
  title: t("admin.meta.title"),
  description: t("admin.meta.description"),
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminTemplate>{children}</AdminTemplate>;
}
