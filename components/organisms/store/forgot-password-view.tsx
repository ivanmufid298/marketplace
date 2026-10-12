"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import type { AuthErrorKey } from "@/lib/auth";
import { Button } from "../../atoms/button";
import { Field } from "../../molecules/field";
import { useAuth } from "../../providers/auth-provider";

type FormError = AuthErrorKey | "required" | "invalidEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Asks for an email and sends a link to /reset-password. Reached from the storefront and the admin login. */
export function ForgotPasswordView() {
  const { mode, requestPasswordReset, openLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) return setError("required");
    if (!EMAIL_PATTERN.test(email.trim())) return setError("invalidEmail");

    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setBusy(false);

    if (!result.ok) return setError(result.error);
    setSentTo(email.trim());
  }

  return (
    <main className="shell auth-page">
      <div className="auth-card">
        <h1>{t("store.auth.forgot.title")}</h1>
        <p className="co-note" style={{ margin: 0 }}>{t("store.auth.forgot.intro")}</p>

        {mode === "misconfigured" ? (
          <p className="login-error" role="alert" style={{ marginTop: 18 }}>{t("store.auth.notConfiguredNotice")}</p>
        ) : sentTo ? (
          <p className="login-info" role="status" style={{ marginTop: 18 }}>{t("store.auth.forgot.sent", { email: sentTo })}</p>
        ) : (
          <form className="login-form" onSubmit={submit} noValidate>
            <Field label={t("store.auth.email")} htmlFor="forgotEmail">
              <input id="forgotEmail" type="email" inputMode="email" autoComplete="email" placeholder={t("store.auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <p className="login-error" role="alert">{t(`store.auth.errors.${error}`)}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? t("store.auth.submitting") : t("store.auth.forgot.submit")}
            </Button>
          </form>
        )}

        <p className="login-switch">
          {t("store.auth.forgot.backToSignIn")}{" "}
          <button type="button" className="link-btn" onClick={() => openLogin()}>{t("store.auth.forgot.backToSignInAction")}</button>
        </p>
        <p className="login-switch" style={{ marginTop: 8 }}>
          <Link href="/" className="link-btn">{t("store.auth.forgot.backToStore")}</Link>
        </p>
      </div>
    </main>
  );
}
