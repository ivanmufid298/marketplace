"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { deriveSummary, type OrderSummary } from "@/lib/order-flow";
import { OrderRow } from "../../molecules/order-row";
import { SearchField } from "../../molecules/search-field";
import { SectionTop } from "../../molecules/section-top";
import { Select } from "../../molecules/select";
import { useAdmin } from "../../providers/admin-provider";
import { OrderDetailModal } from "./order-detail-modal";

const ALL = "all";
const SUMMARIES: OrderSummary[] = ["pending_payment", "payment_review", "processing", "partially_shipped", "completed", "cancelled"];

export function OrdersManager() {
  const { orders } = useAdmin();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [openNumber, setOpenNumber] = useState<string | null>(null);

  const statusOptions = [{ value: ALL, label: t("admin.orders.filterAll") }, ...SUMMARIES.map((s) => ({ value: s, label: t(`admin.orders.summary.${s}`) }))];
  const q = query.trim().toLowerCase();
  const list = orders.filter((o) => (status === ALL || deriveSummary(o) === status) && (!q || `${o.number} ${o.buyer}`.toLowerCase().includes(q)));

  return (
    <section className="view active">
      <SectionTop title={t("admin.orders.title")} text={t("admin.orders.text")} />
      <div className="filters">
        <SearchField variant="admin" value={query} onChange={setQuery} placeholder={t("admin.orders.searchPlaceholder")} />
        <Select options={statusOptions} value={status} onChange={setStatus} />
      </div>
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("admin.orders.cols.order")}</th>
                <th>{t("admin.orders.cols.customer")}</th>
                <th>{t("admin.orders.cols.items")}</th>
                <th>{t("admin.orders.cols.total")}</th>
                <th>{t("admin.orders.cols.payment")}</th>
                <th>{t("admin.orders.cols.status")}</th>
                <th>{t("admin.orders.cols.action")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => <OrderRow key={o.number} order={o} onOpen={() => setOpenNumber(o.number)} />)}
              {!list.length && (
                <tr><td colSpan={7} className="sub" style={{ textAlign: "center", padding: 28 }}>{t("admin.orders.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <OrderDetailModal order={orders.find((o) => o.number === openNumber) ?? null} onClose={() => setOpenNumber(null)} />
    </section>
  );
}
