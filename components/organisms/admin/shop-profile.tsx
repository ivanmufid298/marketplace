"use client";

import { useEffect, useRef, useState } from "react";
import { ACCEPTED_LOGO_TYPES, cleanName, MAX_NAME_LENGTH, useBrand, type BrandError } from "@/features/brand";
import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { Field } from "../../molecules/field";
import { OrdersStatusNote } from "../../molecules/orders-status-note";
import { SectionTop } from "../../molecules/section-top";
import { useAdmin } from "../../providers/admin-provider";

const errorText = (error: BrandError) => t(`admin.profile.errors.${error}`);

/** The shop's name and logo, which the storefront, this panel, and later the emails show. In the database only; the demo keeps the defaults. */
export function ShopProfile() {
  const { showToast } = useAdmin();
  const brand = useBrand();
  const [name, setName] = useState(brand.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [busyLogo, setBusyLogo] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // What was read becomes what is edited, again whenever it changes in the database (after a save, or once the first read arrives).
  useEffect(() => {
    setName(brand.name);
  }, [brand.name]);

  const clean = cleanName(name);
  const changed = clean !== null && clean !== brand.name;

  async function saveName() {
    if (!changed || savingName) return;
    setSavingName(true);
    setProblem(null);
    const result = await brand.saveName(name);
    setSavingName(false);
    if (result.ok) showToast(t("admin.profile.nameSaved"));
    else setProblem(errorText(result.error));
  }

  async function pick(picked: File | undefined) {
    if (!picked || busyLogo) return;
    setBusyLogo(true);
    setProblem(null);
    const result = await brand.uploadLogo(picked);
    setBusyLogo(false);
    if (file.current) file.current.value = "";
    if (result.ok) showToast(t("admin.profile.logoSaved"));
    else setProblem(errorText(result.error));
  }

  async function remove() {
    if (busyLogo) return;
    setBusyLogo(true);
    setProblem(null);
    const result = await brand.removeLogo();
    setBusyLogo(false);
    if (result.ok) showToast(t("admin.profile.logoRemoved"));
    else setProblem(errorText(result.error));
  }

  return (
    <section className="view active">
      <SectionTop title={t("admin.profile.title")} text={t("admin.profile.text")} />
      {!brand.database ? (
        <p className="settings-warning" role="note">{t("admin.profile.demo")}</p>
      ) : (
        <OrdersStatusNote status={brand.status} onRetry={brand.reload} texts={{ loading: t("admin.profile.loading"), error: t("admin.profile.loadError"), retry: t("admin.profile.retry") }} />
      )}

      <div className="card settings-card">
        <div className="card-head"><h3>{t("admin.profile.nameTitle")}</h3></div>
        <p className="sub">{t("admin.profile.nameText")}</p>
        <form className="brand-edit" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
          <Field label={t("admin.profile.nameLabel")} htmlFor="shopName">
            <input id="shopName" value={name} disabled={!brand.database} autoComplete="off" onChange={(e) => setName(e.target.value)} />
            <span className="brand-count">{t("admin.profile.nameCount", { count: [...name.trim()].length, max: MAX_NAME_LENGTH })}</span>
          </Field>
          <AdminButton variant="primary" type="submit" disabled={!brand.database || !changed || savingName}>{t("admin.profile.nameSave")}</AdminButton>
        </form>
      </div>

      <div className="card settings-card">
        <div className="card-head"><h3>{t("admin.profile.logoTitle")}</h3></div>
        <p className="sub">{t("admin.profile.logoText")}</p>
        <div className="brand-preview">
          {brand.logoUrl ? <img src={brand.logoUrl} alt={t("admin.profile.logoPreview")} width={96} height={96} /> : <span className="logo-mark" role="img" aria-label={t("admin.profile.logoPreview")}>M</span>}
          {!brand.logoUrl && <span className="sub" style={{ margin: 0 }}>{t("admin.profile.logoNone")}</span>}
        </div>
        <div className="brand-actions">
          <input ref={file} id="shopLogo" className="brand-file" type="file" accept={ACCEPTED_LOGO_TYPES.join(",")} disabled={!brand.database || busyLogo} onChange={(e) => void pick(e.target.files?.[0])} />
          <AdminButton variant="primary" disabled={!brand.database || busyLogo} onClick={() => file.current?.click()}>
            {busyLogo ? t("admin.profile.logoBusy") : t(brand.logoUrl ? "admin.profile.logoChange" : "admin.profile.logoPick")}
          </AdminButton>
          {brand.logoUrl && <AdminButton disabled={busyLogo} onClick={() => void remove()}>{t("admin.profile.logoRemove")}</AdminButton>}
          <span className="sub" style={{ margin: 0 }}>{t("admin.profile.logoHint")}</span>
        </div>
      </div>
      {problem && <p className="login-error" role="alert">{problem}</p>}
    </section>
  );
}
