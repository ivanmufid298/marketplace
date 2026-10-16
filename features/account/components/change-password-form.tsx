"use client";

import { useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/atoms/button";
import { Field } from "@/components/molecules/field";
import { useAuth, type AuthErrorKey } from "@/features/auth";

type FormError = AuthErrorKey | "required" | "shortPassword" | "passwordMismatch";

const MIN_PASSWORD = 8;

/** Changing the password of the signed-in buyer: the current one first, then the new one twice. */
export function ChangePasswordForm() {
  const { changePassword, demo } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setDone(false);
    if (!current || !next || !confirm) return setError("required");
    if (next.length < MIN_PASSWORD) return setError("shortPassword");
    if (next !== confirm) return setError("passwordMismatch");
    setBusy(true);
    setError(null);
    const result = await changePassword(current, next);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <section className="account-section" aria-labelledby="passwordTitle">
      <h2 id="passwordTitle">{t("store.account.password.title")}</h2>
      <p className="co-note">{t("store.account.password.intro")}</p>
      <form className="address-form" onSubmit={submit} noValidate>
        <div className="fields">
          <Field full label={t("store.account.password.current")} htmlFor="currentPassword">
            <input id="currentPassword" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label={t("store.account.password.new")} htmlFor="newPassword">
            <input id="newPassword" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={t("store.account.password.confirm")} htmlFor="confirmPassword">
            <input id="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <p className="co-note">{t("store.account.password.hint")}</p>
        {demo && <p className="co-note">{t("store.account.password.demo")}</p>}
        {error && <p className="login-error" role="alert">{t(`store.auth.errors.${error}`)}</p>}
        {done && <p className="co-note" role="status">{t("store.account.password.done")}</p>}
        <div className="address-form-actions">
          <Button type="submit" disabled={busy}>{busy ? t("store.account.password.saving") : t("store.account.password.submit")}</Button>
        </div>
      </form>
    </section>
  );
}
