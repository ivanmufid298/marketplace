"use client";

import { t } from "@/lib/i18n";
import { AdminButton } from "../../atoms/admin-button";
import { useAdmin } from "../../providers/admin-provider";
import { PaymentsTable } from "./payments-table";

export function RecentPayments() {
  const { payments } = useAdmin();
  return (
    <div className="table-card">
      <div className="table-head">
        <h3>{t("admin.dashboard.recentPayments")}</h3>
        <AdminButton small href="/admin/payments">{t("admin.dashboard.viewAll")}</AdminButton>
      </div>
      <PaymentsTable payments={payments.slice(0, 4)} compact />
    </div>
  );
}
