"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { OrdersStatusNote } from "../../molecules/orders-status-note";
import { SearchField } from "../../molecules/search-field";
import { SectionTop } from "../../molecules/section-top";
import { Select } from "../../molecules/select";
import { useAdmin } from "../../providers/admin-provider";
import { PaymentsTable } from "./payments-table";

export function PaymentsPanel() {
  const { payments, ordersStatus, reloadOrders } = useAdmin();

  // Opening the screen shows the latest payments.
  useEffect(() => {
    reloadOrders();
    // Only opening the screen should refresh, not every change to the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  // Matches the order number (with or without "MKP-") and the buyer's name.
  const needle = query.trim().toLowerCase().replace(/^#/, "");
  const shown = payments.filter((p) => (filter === "all" || p.status === filter) && (!needle || `${p.id} ${p.name}`.toLowerCase().includes(needle)));
  const filters = [
    { value: "all", label: t("admin.payments.filterAll") },
    { value: "pending", label: t("admin.status.pending") },
    { value: "success", label: t("admin.status.success") },
    { value: "failed", label: t("admin.status.failed") },
  ];

  return (
    <section className="view active">
      <SectionTop title={t("admin.payments.title")} text={t("admin.payments.text")}>
        <div className="filters">
          <SearchField variant="admin" value={query} onChange={setQuery} placeholder={t("admin.payments.searchPlaceholder")} />
          <Select options={filters} value={filter} onChange={setFilter} />
        </div>
      </SectionTop>
      <OrdersStatusNote status={ordersStatus} onRetry={reloadOrders} />
      <div className="table-card">
        <PaymentsTable payments={shown} />
        {shown.length === 0 && ordersStatus === "ready" && <p className="sub" style={{ textAlign: "center", padding: 28, margin: 0 }}>{t(payments.length === 0 ? "admin.payments.empty" : "admin.payments.emptyFiltered")}</p>}
      </div>
    </section>
  );
}
