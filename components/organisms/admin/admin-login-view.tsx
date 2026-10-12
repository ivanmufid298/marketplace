"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getAuthClient, type AuthErrorKey } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { Field } from "../../molecules/field";

export type AdminLoginError = "forbidden" | "config" | "unavailable";
type FormError = AuthErrorKey | "required" | "invalidEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminLoginViewProps = {
  mode: "supabase" | "misconfigured";
  /** Why the visitor was sent here, if they were. */
  error?: AdminLoginError;
  /** Already validated by safeAdminNext on the server. */
  next: string;
};

export function AdminLoginView({ mode, error, next }: AdminLoginViewProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) return setFormError("required");
    if (!EMAIL_PATTERN.test(email.trim())) return setFormError("invalidEmail");
    setBusy(true);
    setFormError(null);
    const result = await getAuthClient().signIn(email, password);
    setBusy(false);
    if (!result.ok) return setFormError(result.error);
    // The session cookie is set now. Whether this account is an admin is decided on the server, which sends a
    // non-admin straight back here with ?error=forbidden.
    router.replace(next);
    router.refresh();
  }

  async function signOutOther() {
    await getAuthClient().signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  const locked = mode === "misconfigured";
  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>{t("admin.login.title")}</h1>
        <p className="sub">{t("admin.login.subtitle")}</p>

        {error && (
          <p className="login-alert" role="alert">
            {t(`admin.login.errors.${error}`)}
          </p>
        )}

        {!locked && (
          <form onSubmit={submit} noValidate className="admin-login-form">
            <Field label={t("admin.login.email")} htmlFor="adminEmail">
              <input id="adminEmail" type="email" inputMode="email" autoComplete="email" placeholder={t("admin.login.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("admin.login.password")} htmlFor="adminPassword">
              <input id="adminPassword" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {formError && (
              <p className="login-alert" role="alert">
                {t(`store.auth.errors.${formError}`)}
              </p>
            )}
            <AdminButton variant="primary" type="submit" disabled={busy}>
              {busy ? t("admin.login.submitting") : t("admin.login.submit")}
            </AdminButton>
          </form>
        )}

        {error === "forbidden" && (
          <div style={{ marginTop: 12 }}>
            <AdminButton onClick={signOutOther}>{t("admin.login.signOutOther")}</AdminButton>
          </div>
        )}

        <p style={{ marginTop: 18 }}>
          <Link href="/" className="link-back">{t("admin.login.backToStore")}</Link>
        </p>
      </div>
    </div>
  );
}
