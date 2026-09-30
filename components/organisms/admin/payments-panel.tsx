"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { SectionTop } from "../../molecules/section-top";
import { Select } from "../../molecules/select";
import { useAdmin } from "../../providers/admin-provider";
import { PaymentsTable } from "./payments-table";

export function PaymentsPanel() {
  const { payments } = useAdmin();
  const [filter, setFilter] = useState("all");
  const filters = [
    { value: "all", label: t("admin.payments.filterAll") },
    { value: "pending", label: t("admin.status.pending") },
    { value: "success", label: t("admin.status.success") },
    { value: "failed", label: t("admin.status.failed") },
  ];

  return (
    <section className="view active">
      <SectionTop title={t("admin.payments.title")} text={t("admin.payments.text")}>
        <div className="filters"><Select options={filters} value={filter} onChange={setFilter} /></div>
      </SectionTop>
      <div className="table-card">
        <PaymentsTable payments={payments.filter((p) => filter === "all" || p.status === filter)} />
      </div>
    </section>
  );
}
