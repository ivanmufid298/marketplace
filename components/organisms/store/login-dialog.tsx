"use client";

import { useEffect, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import type { AuthErrorKey } from "@/lib/auth";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { Field } from "../../molecules/field";
import { useAuth } from "../../providers/auth-provider";
import { useStore } from "../../providers/store-provider";

type Mode = "signIn" | "signUp";
type FormError = AuthErrorKey | "required" | "invalidEmail" | "shortPassword";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/** Sign in or register. Opened whenever a guest tries to chat, check out, or open their orders. */
export function LoginDialog() {
  const { loginOpen, closeLogin, intent, signIn, signUp, demo } = useAuth();
  const { showToast } = useStore();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  // Start every opening from a clean form, keeping the email the buyer already typed.
  useEffect(() => {
    if (!loginOpen) return;
    setError(null);
    setConfirmEmail(false);
    setPassword("");
    document.getElementById("authEmail")?.focus();
  }, [loginOpen]);

  useEffect(() => {
    if (!loginOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeLogin();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [loginOpen, closeLogin]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setConfirmEmail(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password || (mode === "signUp" && !name.trim())) return setError("required");
    if (!EMAIL_PATTERN.test(email.trim())) return setError("invalidEmail");
    if (password.length < MIN_PASSWORD) return setError("shortPassword");

    setBusy(true);
    setError(null);
    const result = mode === "signIn" ? await signIn(email, password) : await signUp({ name, email, password });
    setBusy(false);

    if (!result.ok) return setError(result.error);
    if (result.needsConfirmation) return setConfirmEmail(true);
    // Closing and resuming what the buyer was doing happens in StoreProvider once the user state arrives.
    showToast(t("store.auth.welcome", { name: result.user?.name ?? email }));
  }

  const signUpMode = mode === "signUp";
  return (
    <div className={`login${loginOpen ? " open" : ""}`} role="dialog" aria-modal="true" aria-label={t("store.auth.dialogLabel")} aria-hidden={!loginOpen}>
      <div className="overlay" onClick={closeLogin} />
      <div className="login-card">
        <CloseButton label={t("common.close")} onClick={closeLogin} />
        <h2>{signUpMode ? t("store.auth.signUpTitle") : t("store.auth.signInTitle")}</h2>
        <p className="co-note" style={{ margin: 0 }}>{t(`store.auth.intent.${intent}`)}</p>
        {demo && <p className="login-demo">{t("store.auth.demoNotice")}</p>}

        {confirmEmail ? (
          <p className="login-info" role="status" style={{ marginTop: 18 }}>{t("store.auth.confirmEmail", { email })}</p>
        ) : (
          <form className="login-form" onSubmit={submit} noValidate>
            {signUpMode && (
              <Field label={t("store.auth.name")} htmlFor="authName">
                <input id="authName" autoComplete="name" placeholder={t("store.auth.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label={t("store.auth.email")} htmlFor="authEmail">
              <input id="authEmail" type="email" inputMode="email" autoComplete="email" placeholder={t("store.auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("store.auth.password")} htmlFor="authPassword">
              <input id="authPassword" type="password" autoComplete={signUpMode ? "new-password" : "current-password"} placeholder={t("store.auth.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="login-error" role="alert">{t(`store.auth.errors.${error}`)}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? t("store.auth.submitting") : signUpMode ? t("store.auth.submitSignUp") : t("store.auth.submitSignIn")}
            </Button>
          </form>
        )}

        <p className="login-switch">
          {signUpMode ? t("store.auth.switchToSignIn") : t("store.auth.switchToSignUp")}{" "}
          <button type="button" className="link-btn" onClick={() => switchMode(signUpMode ? "signIn" : "signUp")}>
            {signUpMode ? t("store.auth.switchToSignInAction") : t("store.auth.switchToSignUpAction")}
          </button>
        </p>
      </div>
    </div>
  );
}
