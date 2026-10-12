import type { Metadata } from "next";
import { ForgotPasswordView } from "@/features/auth";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("store.auth.forgot.title"), robots: { index: false } };

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
