import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StoreTemplate } from "@/components/templates/store-template";
import { t } from "@/lib/i18n";
import "./store.css";

export const metadata: Metadata = {
  title: t("store.meta.title"),
  description: t("store.meta.description"),
};

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <StoreTemplate>{children}</StoreTemplate>;
}
