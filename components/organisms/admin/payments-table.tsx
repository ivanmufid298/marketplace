"use client";

import { t } from "@/lib/i18n";
import type { Payment } from "@/lib/mock/admin";
import { PaymentRow } from "../../molecules/payment-row";
import { useAdmin } from "../../providers/admin-provider";

type PaymentsTableProps = {
  payments: Payment[];
  /** Compact tables (dashboard) show time instead of the proof column. */
  compact?: boolean;
};

export function PaymentsTable({ payments, compact = false }: PaymentsTableProps) {
  const { setPaymentStatus, showToast } = useAdmin();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("admin.table.order")}</th>
            <th>{t("admin.table.customer")}</th>
            <th>{compact ? t("admin.table.total") : t("admin.table.transfer")}</th>
            <th>{compact ? t("admin.table.time") : t("admin.table.proof")}</th>
            <th>{t("admin.table.status")}</th>
            <th>{t("admin.table.action")}</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <PaymentRow
              key={p.id}
              payment={p}
              compact={compact}
              onAccept={() => setPaymentStatus(p.id, "success")}
              onReject={() => setPaymentStatus(p.id, "failed")}
              onViewProof={() => showToast(t("admin.payments.toastProof"))}
              onDetail={() => showToast(t("admin.payments.toastDetail", { id: p.id }))}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
