import type { Metadata } from "next";
import { ResetPasswordView } from "@/features/auth";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("store.auth.reset.title"), robots: { index: false } };

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
