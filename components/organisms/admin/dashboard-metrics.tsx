"use client";

import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { summarizeOrders } from "@/lib/order-flow";
import { Icon } from "../../atoms/icon";
import { MetricCard } from "../../molecules/metric-card";
import { useAdmin } from "../../providers/admin-provider";

/** The four numbers at the top of the dashboard, counted from the real orders (the database, or the sample store in the demo). */
export function DashboardMetrics() {
  const { orders, ordersStatus } = useAdmin();
  const summary = summarizeOrders(orders);
  // Until the orders are read there is nothing to count; a failed read says so rather than showing zeros as if they were true.
  const unknown = ordersStatus !== "ready" && orders.length === 0;
  const value = (n: number, format: (n: number) => string = String) => (unknown ? "…" : format(n));
  const note = (text: string) => (ordersStatus === "error" && orders.length === 0 ? t("admin.dashboard.metrics.loadFailed") : ordersStatus === "loading" && orders.length === 0 ? t("admin.dashboard.metrics.loading") : text);
  return (
    <div className="cards">
      <MetricCard label={t("admin.dashboard.metrics.sales")} value={value(summary.sales, money)} note={note(t("admin.dashboard.metrics.salesNote", { count: summary.paidCount }))} icon="Rp" />
      <MetricCard
        label={t("admin.dashboard.metrics.pending")}
        value={value(summary.toReview)}
        note={note(t(summary.toReview > 0 ? "admin.dashboard.metrics.pendingNote" : "admin.dashboard.metrics.pendingNone"))}
        warn={summary.toReview > 0}
        icon={<Icon name="clock" />}
        href="/admin/payments"
      />
      <MetricCard
        label={t("admin.dashboard.metrics.toShip")}
        value={value(summary.toShip)}
        note={note(t(summary.toShip > 0 ? "admin.dashboard.metrics.toShipNote" : "admin.dashboard.metrics.toShipNone"))}
        warn={summary.toShip > 0}
        icon={<Icon name="package" />}
        href="/admin/orders"
      />
      <MetricCard
        label={t("admin.dashboard.metrics.refunds")}
        value={value(summary.refundsPending)}
        note={note(t(summary.refundsPending > 0 ? "admin.dashboard.metrics.refundsNote" : "admin.dashboard.metrics.refundsNone"))}
        warn={summary.refundsPending > 0}
        icon={<Icon name="bag" />}
        href="/admin/orders"
      />
    </div>
  );
}
