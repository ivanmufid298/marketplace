"use client";

import { useEffect, useState } from "react";
import { DestinationPicker, COURIERS, groupRupiah, parseRupiah, useShippingSettings, validateMethod, validateSettings, type ManualMethod, type SettingsServices, type ShippingSettings } from "@/features/shipping";
import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { OrdersStatusNote } from "../../molecules/orders-status-note";
import { SectionTop } from "../../molecules/section-top";
import { useAdmin } from "../../providers/admin-provider";

type Draft = { originId: number | null; originLabel: string | null; couriers: string[]; freeMin: string; markup: string };
const draftOf = (s: ShippingSettings): Draft => ({ originId: s.originId, originLabel: s.originLabel, couriers: s.couriers, freeMin: s.freeShippingMin === null ? "" : groupRupiah(s.freeShippingMin), markup: s.markup === 0 ? "" : groupRupiah(s.markup) });

/** The shop's shipping settings (where parcels leave from, the couriers, free shipping, a markup) and its manual rates, in the database. */
export function ShippingSettingsDb({ services }: { services?: SettingsServices }) {
  const { showToast } = useAdmin();
  const state = useShippingSettings(services);
  const { settings, methods, status } = state;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // What was read becomes what is edited, once, and again whenever it changes in the database (after a save).
  useEffect(() => {
    if (settings) setDraft(draftOf(settings));
  }, [settings]);

  async function save() {
    if (!draft || saving) return;
    const free = draft.freeMin.trim() === "" ? null : parseRupiah(draft.freeMin);
    const markup = draft.markup.trim() === "" ? 0 : parseRupiah(draft.markup, { allowNegative: true });
    const found: string[] = [];
    if (free === null && draft.freeMin.trim() !== "") found.push("freeShippingMin");
    if (markup === null) found.push("markup");
    // Everything that is wrong is named at once (an amount that could not be read counts as nothing while the rest is checked).
    const checked = validateSettings({ originId: draft.originId, originLabel: draft.originLabel, couriers: draft.couriers, freeShippingMin: free, markup: markup ?? 0 });
    found.push(...Object.keys(checked));
    setProblems(found);
    setFailure(null);
    if (found.length > 0) return;
    setSaving(true);
    const result = await state.saveSettings({ originId: draft.originId, originLabel: draft.originLabel, couriers: draft.couriers, freeShippingMin: free, markup: markup ?? 0 });
    setSaving(false);
    if (result.ok) showToast(t("admin.shipping.db.saved"));
    else setFailure(t(`admin.shipping.db.errors.${result.error}`));
  }

  const toggleCourier = (code: string) => setDraft((d) => (d ? { ...d, couriers: d.couriers.includes(code) ? d.couriers.filter((c) => c !== code) : [...d.couriers, code] } : d));
  const problem = (key: string) => problems.includes(key) && <p className="login-error" role="alert">{t(`admin.shipping.db.problems.${key as "couriers" | "freeShippingMin" | "markup" | "origin"}`)}</p>;

  return (
    <section className="view active">
      <SectionTop title={t("admin.shipping.title")} text={t("admin.shipping.text")} />
      <OrdersStatusNote status={status} onRetry={state.reload} texts={{ loading: t("admin.shipping.db.loading"), error: t("admin.shipping.db.loadError"), retry: t("admin.shipping.db.retry") }} />
      {draft && (
        <>
          <div className="card settings-card">
            <div className="card-head"><h3>{t("admin.shipping.db.originTitle")}</h3></div>
            <p className="sub">{t("admin.shipping.db.originText")}</p>
            {!draft.originId && <p className="settings-warning" role="note">{t("admin.shipping.db.originMissing")}</p>}
            <div className="field full">
              <label htmlFor="originPlace">{t("store.shipping.picker.label")}</label>
              <DestinationPicker id="originPlace" selected={draft.originId && draft.originLabel ? { id: draft.originId, label: draft.originLabel } : null} onSelect={(d) => setDraft({ ...draft, originId: d.id, originLabel: d.label })} onClear={() => setDraft({ ...draft, originId: null, originLabel: null })} />
            </div>
            {problem("origin")}
          </div>

          <div className="card settings-card">
            <div className="card-head"><h3>{t("admin.shipping.db.couriersTitle")}</h3></div>
            <p className="sub">{t("admin.shipping.db.couriersText")}</p>
            <div className="courier-grid" role="group" aria-label={t("admin.shipping.db.couriersTitle")}>
              {COURIERS.map((c) => (
                <label key={c.code} className={`courier-option${draft.couriers.includes(c.code) ? " on" : ""}`}>
                  <input type="checkbox" checked={draft.couriers.includes(c.code)} onChange={() => toggleCourier(c.code)} /> {c.name}
                </label>
              ))}
            </div>
            {problem("couriers")}
          </div>

          <div className="card settings-card">
            <div className="card-head"><h3>{t("admin.shipping.db.feesTitle")}</h3></div>
            <div className="fields">
              <div className="field">
                <label htmlFor="freeMin">{t("admin.shipping.db.freeMin")}</label>
                <input id="freeMin" inputMode="numeric" value={draft.freeMin} onChange={(e) => setDraft({ ...draft, freeMin: e.target.value })} />
                <small className="sub">{t("admin.shipping.db.freeMinHint")}</small>
                {problem("freeShippingMin")}
              </div>
              <div className="field">
                <label htmlFor="markup">{t("admin.shipping.db.markup")}</label>
                <input id="markup" inputMode="numeric" value={draft.markup} onChange={(e) => setDraft({ ...draft, markup: e.target.value })} />
                <small className="sub">{t("admin.shipping.db.markupHint")}</small>
                {problem("markup")}
              </div>
            </div>
          </div>

          {failure && <p className="login-error" role="alert">{failure}</p>}
          <div className="settings-actions">
            <AdminButton variant="primary" disabled={saving} onClick={() => void save()}>{saving ? t("admin.shipping.db.saving") : t("admin.shipping.db.save")}</AdminButton>
          </div>
        </>
      )}

      {methods.length > 0 && (
        <div className="card settings-card">
          <div className="card-head"><h3>{t("admin.shipping.db.methodsTitle")}</h3></div>
          <p className="sub">{t("admin.shipping.db.methodsText")}</p>
          <div className="method-list">
            {methods.map((m) => <MethodRow key={m.code} method={m} onSave={state.saveMethod} />)}
          </div>
        </div>
      )}
    </section>
  );
}

/** One manual rate, edited and saved on its own. */
function MethodRow({ method, onSave }: { method: ManualMethod; onSave: ReturnType<typeof useShippingSettings>["saveMethod"] }) {
  const { showToast } = useAdmin();
  const [label, setLabel] = useState(method.label);
  const [note, setNote] = useState(method.note);
  const [fee, setFee] = useState(groupRupiah(method.fee));
  const [active, setActive] = useState(method.active);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The row follows the database after a save (and shows another admin's change).
  useEffect(() => {
    setLabel(method.label);
    setNote(method.note);
    setFee(groupRupiah(method.fee));
    setActive(method.active);
  }, [method]);

  async function save() {
    if (busy) return;
    const parsed = parseRupiah(fee);
    const change = { label, note, fee: parsed ?? -1, active };
    const found = validateMethod(change);
    if (found.label) return setMessage(t("admin.shipping.db.methodNeedsLabel"));
    if (found.note) return setMessage(t("admin.shipping.db.methodNeedsNote"));
    if (found.fee) return setMessage(t("admin.shipping.db.methodNeedsFee"));
    setBusy(true);
    setMessage(null);
    const result = await onSave(method.code, change);
    setBusy(false);
    if (result.ok) showToast(t("admin.shipping.db.methodSaved", { name: label.trim() }));
    else setMessage(t(`admin.shipping.db.errors.${result.error}`));
  }

  return (
    <div className="method-row" data-code={method.code}>
      <div className="field">
        <label htmlFor={`m-${method.code}-label`}>{t("admin.shipping.db.methodLabel")}</label>
        <input id={`m-${method.code}-label`} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`m-${method.code}-note`}>{t("admin.shipping.db.methodNote")}</label>
        <input id={`m-${method.code}-note`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`m-${method.code}-fee`}>{t("admin.shipping.db.methodFee")}</label>
        <input id={`m-${method.code}-fee`} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <label className="method-active"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t("admin.shipping.db.methodActive")}</label>
      <AdminButton small disabled={busy} onClick={() => void save()}>{t("admin.shipping.db.methodSave")}</AdminButton>
      {message && <p className="login-error method-message" role="alert">{message}</p>}
    </div>
  );
}
