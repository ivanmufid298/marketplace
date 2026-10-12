import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginView, type AdminLoginError } from "@/components/organisms/admin/admin-login-view";
import { authMode } from "@/lib/auth/config";
import { safeAdminNext } from "@/lib/auth/safe-next";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: t("admin.login.title") };

const KNOWN_ERRORS: AdminLoginError[] = ["forbidden", "config", "unavailable"];

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const mode = authMode();
  // Demo mode has no login: the panel is open.
  if (mode === "demo") redirect("/admin");

  const params = await searchParams;
  const requested = KNOWN_ERRORS.find((e) => e === params.error);
  const error = mode === "misconfigured" ? "config" : requested;
  return <AdminLoginView mode={mode} error={error} next={safeAdminNext(params.next)} />;
}
