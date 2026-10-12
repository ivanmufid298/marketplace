import type { Metadata } from "next";
import { ResetPasswordView } from "@/components/organisms/store/reset-password-view";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("store.auth.reset.title"), robots: { index: false } };

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
