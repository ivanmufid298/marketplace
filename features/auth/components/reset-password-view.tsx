"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import type { AuthErrorKey } from "../lib/client";
import { Button } from "@/components/atoms/button";
import { Field } from "@/components/molecules/field";
import { useAuth } from "../auth-provider";

type FormError = AuthErrorKey | "required" | "shortPassword" | "passwordMismatch";

const MIN_PASSWORD = 8;

/**
 * Where the emailed link lands. Supabase has already turned the link's code into a short-lived session by the time
 * `ready` is true, so a missing user here means the link was expired, used, or opened in another browser.
 */
export function ResetPasswordView() {
  const { ready, user, mode, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!password || !confirm) return setError("required");
    if (password.length < MIN_PASSWORD) return setError("shortPassword");
    if (password !== confirm) return setError("passwordMismatch");

    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    setBusy(false);

    if (!result.ok) return setError(result.error);
    setPassword("");
    setConfirm("");
    setDone(true);
  }

  if (mode === "misconfigured") {
    return (
      <main className="shell auth-page">
        <div className="auth-card">
          <h1>{t("store.auth.reset.title")}</h1>
          <p className="login-error" role="alert" style={{ marginTop: 18 }}>{t("store.auth.notConfiguredNotice")}</p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="shell auth-page">
        <div className="auth-card">
          <p className="co-note" role="status" style={{ margin: 0 }}>{t("store.auth.reset.checking")}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="shell auth-page">
        <div className="auth-card">
          <h1>{t("store.auth.reset.invalidTitle")}</h1>
          <p className="login-error" role="alert" style={{ marginTop: 18 }}>{t("store.auth.reset.invalid")}</p>
          <p className="login-switch">
            <Link href="/lupa-sandi" className="link-btn">{t("store.auth.reset.requestAgain")}</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell auth-page">
      <div className="auth-card">
        <h1>{t("store.auth.reset.title")}</h1>
        {done ? (
          <>
            <p className="login-info" role="status" style={{ marginTop: 18 }}>{t("store.auth.reset.done")}</p>
            <p className="login-switch">
              <Link href="/" className="link-btn">{t("store.auth.reset.toStore")}</Link>
            </p>
          </>
        ) : (
          <>
            <p className="co-note" style={{ margin: 0 }}>{t("store.auth.reset.intro")}</p>
            <form className="login-form" onSubmit={submit} noValidate>
              <Field label={t("store.auth.reset.password")} htmlFor="resetPassword">
                <input id="resetPassword" type="password" autoComplete="new-password" placeholder={t("store.auth.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label={t("store.auth.reset.confirm")} htmlFor="resetConfirm">
                <input id="resetConfirm" type="password" autoComplete="new-password" placeholder={t("store.auth.passwordPlaceholder")} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              {error && <p className="login-error" role="alert">{t(`store.auth.errors.${error}`)}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? t("store.auth.submitting") : t("store.auth.reset.submit")}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
