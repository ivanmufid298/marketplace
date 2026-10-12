"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getAuthClient, type AuthErrorKey } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { Icon, type IconName } from "../../atoms/icon";
import { AdminButton } from "../../atoms/admin-button";
import styles from "./admin-login-view.module.css";

export type AdminLoginError = "forbidden" | "config" | "unavailable";
type FormError = AuthErrorKey | "required" | "invalidEmail";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FEATURES: { icon: IconName; key: "orders" | "payments" | "catalog" }[] = [
  { icon: "products", key: "orders" },
  { icon: "payments", key: "payments" },
  { icon: "catalog", key: "catalog" },
];

type AdminLoginViewProps = {
  mode: "supabase" | "misconfigured";
  /** Why the visitor was sent here, if they were. */
  error?: AdminLoginError;
  /** Already validated by safeAdminNext on the server. */
  next: string;
};

function BrandLockup() {
  const brand = t("common.brand");
  return (
    <>
      <span className={styles.mark} aria-hidden="true">{brand.charAt(0)}</span>
      <div className={styles.brandName}>
        {brand}
        <small>{t("admin.login.console")}</small>
      </div>
    </>
  );
}

function Alert({ children }: { children: string }) {
  return (
    <p className={styles.alert} role="alert">
      <Icon name="alert" />
      <span>{children}</span>
    </p>
  );
}

export function AdminLoginView({ mode, error, next }: AdminLoginViewProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <main className={styles.shell}>
      <section className={styles.brand} aria-label={t("admin.login.console")}>
        <div className={styles.brandTop}>
          <BrandLockup />
        </div>
        <div className={styles.brandCopy}>
          <span className={styles.eyebrow}><i />{t("admin.login.eyebrow")}</span>
          <h1>{t("admin.login.headline")}</h1>
          <p className={styles.intro}>{t("admin.login.intro")}</p>
          <div className={styles.features}>
            {FEATURES.map(({ icon, key }) => (
              <div className={styles.feature} key={key}>
                <Icon name={icon} strokeWidth={1.7} />
                <b>{t(`admin.login.features.${key}.title`)}</b>
                <span>{t(`admin.login.features.${key}.note`)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.brandFoot}>
          {t("admin.login.footer", { year: new Date().getFullYear(), brand: t("common.brand") })}
        </div>
      </section>

      <section className={styles.loginSide}>
        <div className={styles.login}>
          <div className={styles.mobileBrand}>
            <BrandLockup />
          </div>
          <span className={styles.security}>
            <Icon name="shield" />
            {t("admin.login.security")}
          </span>
          <h2>{t("admin.login.welcome")}</h2>
          <p className={styles.lead}>{t("admin.login.subtitle")}</p>

          {error && <Alert>{t(`admin.login.errors.${error}`)}</Alert>}

          {!locked && (
            <form onSubmit={submit} noValidate>
              {formError && <Alert>{t(`store.auth.errors.${formError}`)}</Alert>}
              <div className={styles.field}>
                <label htmlFor="adminEmail">{t("admin.login.email")}</label>
                <div className={styles.control}>
                  <Icon name="mail" strokeWidth={1.8} />
                  <input id="adminEmail" name="email" type="email" inputMode="email" autoComplete="email" placeholder={t("admin.login.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="adminPassword">{t("admin.login.password")}</label>
                <div className={styles.control}>
                  <Icon name="lock" strokeWidth={1.8} />
                  <input id="adminPassword" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder={t("admin.login.passwordPlaceholder")} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className={styles.toggle} aria-label={showPassword ? t("admin.login.hidePassword") : t("admin.login.showPassword")} aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
                    <Icon name={showPassword ? "eyeOff" : "eye"} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              <button type="submit" className={styles.submit} disabled={busy}>
                {busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
                <span>{busy ? t("admin.login.submitting") : t("admin.login.submit")}</span>
                {busy ? null : <Icon name="arrowRight" />}
              </button>
            </form>
          )}

          {error === "forbidden" && (
            <div className={styles.signOut}>
              <AdminButton onClick={signOutOther}>{t("admin.login.signOutOther")}</AdminButton>
            </div>
          )}

          <Link href="/" className={styles.back}>
            <Icon name="back" />
            {t("admin.login.backToStore")}
          </Link>
          <div className={styles.secureNote}>
            <Icon name="lock" strokeWidth={1.8} />
            {t("admin.login.secureNote")}
          </div>
        </div>
      </section>
    </main>
  );
}
