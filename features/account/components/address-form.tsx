"use client";

import { useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/atoms/button";
import { Field } from "@/components/molecules/field";
import { validateAddress, type AddressField, type AddressProblems } from "../lib/validate";
import { ADDRESS_LIMITS, MAX_ADDRESSES, type AddressInput, type AddressResult, type SavedAddress } from "../lib/types";

type AddressFormProps = {
  /** The address being changed; empty for a new one. */
  initial?: SavedAddress;
  /** Fills the recipient's name of a new address (the account's name). */
  defaultName?: string;
  /** Show "make this my main address". Not for the first address (it is the main one anyway) or one that already is. */
  offerDefault?: boolean;
  /** Prefix for the field ids, so two forms on a page do not clash. */
  idPrefix: string;
  submitLabel: string;
  /** Saves it. The form shows what went wrong when it did not work, and calls `onSaved` when it did. */
  onSave: (input: AddressInput) => Promise<AddressResult<unknown>>;
  onSaved: () => void;
  onCancel?: () => void;
};

const problemText = (field: AddressField, problems: AddressProblems) => {
  const problem = problems[field];
  if (!problem) return null;
  const limits: Record<AddressField, { min: number; max: number }> = {
    label: { min: 1, max: ADDRESS_LIMITS.label }, recipientName: { min: 1, max: ADDRESS_LIMITS.recipientName }, phone: { min: ADDRESS_LIMITS.phoneMin, max: ADDRESS_LIMITS.phoneMax },
    address: { min: 1, max: ADDRESS_LIMITS.address }, city: { min: 1, max: ADDRESS_LIMITS.city }, postcode: { min: 1, max: ADDRESS_LIMITS.postcode }, note: { min: 0, max: ADDRESS_LIMITS.note },
  };
  return t(`store.account.form.problems.${problem}`, limits[field]);
};

/** The form for one address, used on the account page and at checkout. */
export function AddressForm({ initial, defaultName = "", offerDefault = false, idPrefix, submitLabel, onSave, onSaved, onCancel }: AddressFormProps) {
  const [values, setValues] = useState({
    label: initial?.label ?? "",
    recipientName: initial?.recipientName ?? defaultName,
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    postcode: initial?.postcode ?? "",
    note: initial?.note ?? "",
  });
  const [makeDefault, setMakeDefault] = useState(false);
  const [problems, setProblems] = useState<AddressProblems>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: AddressField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (problems[field]) setProblems((p) => ({ ...p, [field]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const input: AddressInput = { ...values, ...(makeDefault ? { isDefault: true } : {}) };
    const found = validateAddress(input);
    setProblems(found);
    setFailure(null);
    const first = (Object.keys(found) as AddressField[])[0];
    if (first) {
      document.getElementById(`${idPrefix}-${first}`)?.focus();
      return;
    }
    setBusy(true);
    const result = await onSave(input);
    setBusy(false);
    if (!result.ok) return setFailure(t(`store.account.errors.${result.error}`, { max: MAX_ADDRESSES }));
    onSaved();
  }

  const field = (name: AddressField, label: string, props: { placeholder?: string; autoComplete?: string; inputMode?: "tel" | "numeric"; full?: boolean } = {}) => {
    const id = `${idPrefix}-${name}`;
    const problem = problemText(name, problems);
    return (
      <Field label={label} htmlFor={id} full={props.full}>
        <input id={id} value={values[name]} placeholder={props.placeholder} autoComplete={props.autoComplete} inputMode={props.inputMode} aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-problem` : undefined} onChange={(e) => set(name, e.target.value)} />
        {problem && <small id={`${id}-problem`} className="login-error" role="alert">{problem}</small>}
      </Field>
    );
  };

  const addressProblem = problemText("address", problems);
  const noteProblem = problemText("note", problems);
  return (
    <form className="address-form" onSubmit={submit} noValidate>
      <div className="fields">
        {field("label", t("store.account.form.label"), { placeholder: t("store.account.form.labelPlaceholder"), full: true })}
        {field("recipientName", t("store.account.form.recipient"), { autoComplete: "name" })}
        {field("phone", t("store.account.form.phone"), { placeholder: t("store.account.form.phonePlaceholder"), inputMode: "tel", autoComplete: "tel" })}
        <Field full label={t("store.account.form.address")} htmlFor={`${idPrefix}-address`}>
          <textarea id={`${idPrefix}-address`} value={values.address} placeholder={t("store.account.form.addressPlaceholder")} aria-invalid={addressProblem ? true : undefined} aria-describedby={addressProblem ? `${idPrefix}-address-problem` : undefined} onChange={(e) => set("address", e.target.value)} />
          {addressProblem && <small id={`${idPrefix}-address-problem`} className="login-error" role="alert">{addressProblem}</small>}
        </Field>
        {field("city", t("store.account.form.city"), { autoComplete: "address-level2" })}
        {field("postcode", t("store.account.form.postcode"), { inputMode: "numeric", autoComplete: "postal-code" })}
        <Field full htmlFor={`${idPrefix}-note`} label={<>{t("store.account.form.note")} <span style={{ fontWeight: 400, color: "var(--muted)" }}>{t("store.account.form.optional")}</span></>}>
          <input id={`${idPrefix}-note`} value={values.note} placeholder={t("store.account.form.notePlaceholder")} aria-invalid={noteProblem ? true : undefined} aria-describedby={noteProblem ? `${idPrefix}-note-problem` : undefined} onChange={(e) => set("note", e.target.value)} />
          {noteProblem && <small id={`${idPrefix}-note-problem`} className="login-error" role="alert">{noteProblem}</small>}
        </Field>
      </div>
      {offerDefault && (
        <label className="address-default-option">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> {t("store.account.form.makeDefault")}
        </label>
      )}
      {failure && <p className="login-error" role="alert">{failure}</p>}
      <div className="address-form-actions">
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>{t("store.account.form.cancel")}</Button>}
        <Button type="submit" disabled={busy}>{busy ? t("store.account.form.saving") : submitLabel}</Button>
      </div>
    </form>
  );
}
