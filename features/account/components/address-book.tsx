"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { useAuth } from "@/features/auth";
import { useUi } from "@/shared/ui-state/ui-provider";
import { Button } from "@/components/atoms/button";
import { useAddresses } from "../addresses-provider";
import { addressLine } from "../lib/validate";
import { MAX_ADDRESSES, type AddressResult, type SavedAddress } from "../lib/types";
import { AddressForm } from "./address-form";

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string };

/** The buyer's saved addresses: see them, add one, change one, choose the main one, delete one. */
export function AddressBook() {
  const { user } = useAuth();
  const { showToast } = useUi();
  const { addresses, status, add, update, remove, setDefault, reload } = useAddresses();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const full = addresses.length >= MAX_ADDRESSES;

  const run = async (action: () => Promise<AddressResult<unknown>>, done: string) => {
    setFailure(null);
    const result = await action();
    if (result.ok) showToast(done);
    else setFailure(t(`store.account.errors.${result.error}`, { max: MAX_ADDRESSES }));
  };
  const card = (a: SavedAddress) => (
    <li key={a.id} className={`address-card${a.isDefault ? " default" : ""}`}>
      <div className="address-card-head">
        <b>{a.label}</b>
        {a.isDefault && <span className="address-badge">{t("store.account.addresses.default")}</span>}
      </div>
      <p>{a.recipientName} · {a.phone}</p>
      <p className="address-line">{addressLine(a)}</p>
      {a.note && <p className="sub">{a.note}</p>}
      {mode.kind === "edit" && mode.id === a.id ? (
        <AddressForm
          initial={a}
          idPrefix={`edit-${a.id}`}
          offerDefault={!a.isDefault}
          submitLabel={t("store.account.form.saveChanges")}
          onSave={(input) => update(a.id, input)}
          onSaved={() => { setMode({ kind: "list" }); showToast(t("store.account.addresses.toastUpdated")); }}
          onCancel={() => setMode({ kind: "list" })}
        />
      ) : confirming === a.id ? (
        <div role="group" aria-label={t("store.account.addresses.deleteAsk", { label: a.label })} className="address-confirm">
          <span>{t("store.account.addresses.deleteAsk", { label: a.label })}</span>
          <Button onClick={() => { setConfirming(null); void run(() => remove(a.id), t("store.account.addresses.toastDeleted")); }}>{t("store.account.addresses.deleteYes")}</Button>
          <Button variant="secondary" onClick={() => setConfirming(null)}>{t("store.account.addresses.deleteNo")}</Button>
        </div>
      ) : (
        <div className="address-actions">
          <button type="button" className="link-btn" onClick={() => { setConfirming(null); setMode({ kind: "edit", id: a.id }); }}>{t("store.account.addresses.edit")}</button>
          {!a.isDefault && <button type="button" className="link-btn" onClick={() => void run(() => setDefault(a.id), t("store.account.addresses.toastDefault"))}>{t("store.account.addresses.makeDefault")}</button>}
          <button type="button" className="link-btn" onClick={() => { setMode({ kind: "list" }); setConfirming(a.id); }}>{t("store.account.addresses.delete")}</button>
        </div>
      )}
    </li>
  );

  return (
    <section className="account-section" aria-labelledby="addressesTitle">
      <div className="account-section-head">
        <div>
          <h2 id="addressesTitle">{t("store.account.addresses.title")}</h2>
          <p className="co-note">{t("store.account.addresses.intro")}</p>
        </div>
        {mode.kind !== "add" && addresses.length > 0 && !full && <Button onClick={() => { setConfirming(null); setMode({ kind: "add" }); }}>{t("store.account.addresses.add")}</Button>}
      </div>

      {failure && <p className="login-error" role="alert">{failure}</p>}
      {status === "loading" && addresses.length === 0 ? (
        <p className="co-note" role="status">{t("store.account.addresses.loading")}</p>
      ) : status === "error" && addresses.length === 0 ? (
        <p className="login-error" role="alert">{t("store.account.addresses.loadError")} <button type="button" className="link-btn" onClick={reload}>{t("store.account.addresses.retry")}</button></p>
      ) : addresses.length === 0 && mode.kind !== "add" ? (
        <div className="address-empty">
          <p>{t("store.account.addresses.empty")}</p>
          <Button onClick={() => setMode({ kind: "add" })}>{t("store.account.addresses.add")}</Button>
        </div>
      ) : (
        <ul className="address-list">{addresses.map(card)}</ul>
      )}
      {full && <p className="co-note">{t("store.account.addresses.full", { max: MAX_ADDRESSES })}</p>}

      {mode.kind === "add" && (
        <div className="address-new">
          <h3>{t("store.account.addresses.add")}</h3>
          <AddressForm
            defaultName={user?.name ?? ""}
            idPrefix="new-address"
            offerDefault={addresses.length > 0}
            submitLabel={t("store.account.form.save")}
            onSave={add}
            onSaved={() => { setMode({ kind: "list" }); showToast(t("store.account.addresses.toastSaved")); }}
            onCancel={addresses.length > 0 ? () => setMode({ kind: "list" }) : undefined}
          />
        </div>
      )}
    </section>
  );
}
