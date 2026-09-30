import { t } from "@/lib/i18n";
import type { Payment } from "@/lib/mock/admin";
import { AdminButton } from "../atoms/admin-button";
import { StatusBadge } from "../atoms/badges";

type PaymentRowProps = {
  payment: Payment;
  /** Compact rows show the time instead of the proof button (dashboard). */
  compact?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onViewProof: () => void;
  onDetail: () => void;
};

export function PaymentRow({ payment: p, compact = false, onAccept, onReject, onViewProof, onDetail }: PaymentRowProps) {
  return (
    <tr>
      <td><strong>#{p.id}</strong><span className="sub">{t("admin.payments.manualTransfer")}</span></td>
      <td>{p.name}</td>
      <td><strong>{p.total}</strong></td>
      <td>{compact ? p.time : <AdminButton small onClick={onViewProof}>{t("admin.payments.viewProof")}</AdminButton>}</td>
      <td><StatusBadge tone={p.status}>{t(`admin.status.${p.status}`)}</StatusBadge></td>
      <td>
        <div className="row-actions">
          {p.status === "pending" ? (
            <>
              <AdminButton variant="soft" small onClick={onAccept}>{t("admin.payments.accept")}</AdminButton>
              <AdminButton small onClick={onReject}>{t("admin.payments.reject")}</AdminButton>
            </>
          ) : (
            <AdminButton small onClick={onDetail}>{t("admin.payments.detail")}</AdminButton>
          )}
        </div>
      </td>
    </tr>
  );
}
