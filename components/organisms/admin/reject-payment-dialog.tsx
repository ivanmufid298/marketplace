"use client";

import { useEffect, useState, type FormEvent } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { CloseButton } from "../../atoms/close-button";
import { Field } from "../../molecules/field";

type RejectPaymentDialogProps = {
  /** The order's label, such as "MKP-100002". */
  paymentId: string;
  /** Resolves true when the rejection went through, which closes the dialog. */
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
};

/** Asks the admin why a transfer proof is rejected; the buyer reads the reason and may send a new proof. */
export function RejectPaymentDialog({ paymentId, onConfirm, onClose }: RejectPaymentDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    const done = await onConfirm(reason.trim());
    setBusy(false);
    if (done) onClose();
  }

  const title = t("admin.orders.rejectDialog.title");
  return (
    <div className="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <span className="sub">#{paymentId}</span>
          </div>
          <CloseButton label={t("common.close")} onClick={() => !busy && onClose()} />
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <p className="sub" style={{ marginTop: 0 }}>{t("admin.orders.rejectDialog.text")}</p>
            <Field label={t("admin.orders.rejectDialog.label")} htmlFor="rejectReason">
              <textarea id="rejectReason" autoFocus maxLength={500} value={reason} placeholder={t("admin.orders.rejectDialog.placeholder")} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <div className="modal-foot">
            <AdminButton disabled={busy} onClick={onClose}>{t("admin.orders.rejectDialog.back")}</AdminButton>
            <AdminButton type="submit" variant="primary" disabled={busy || !reason.trim()}>{t("admin.orders.rejectDialog.confirm")}</AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
