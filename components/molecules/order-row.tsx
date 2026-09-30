import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { deriveSummary, itemCount, orderTotal, type OrderSummary } from "@/lib/order-flow";
import type { AdminOrder, OrderPaymentStatus } from "@/lib/mock/orders";
import { AdminButton } from "../atoms/admin-button";
import { StatusBadge, type StatusTone } from "../atoms/badges";

export const SUMMARY_TONE: Record<OrderSummary, StatusTone> = {
  pending_payment: "pending",
  payment_review: "pending",
  processing: "progress",
  partially_shipped: "progress",
  completed: "success",
  cancelled: "failed",
};

export const PAYMENT_TONE: Record<OrderPaymentStatus, StatusTone> = {
  awaiting_payment: "pending",
  under_review: "pending",
  paid: "success",
  rejected: "failed",
  expired: "neutral",
  refund_pending: "pending",
  refunded: "neutral",
};

export function OrderRow({ order, onOpen }: { order: AdminOrder; onOpen: () => void }) {
  const summary = deriveSummary(order);
  return (
    <tr>
      <td><strong>{t("admin.orders.orderLabel", { number: order.number })}</strong><span className="sub">{order.date}</span></td>
      <td>{order.buyer}</td>
      <td>{t("admin.orders.itemCount", { count: itemCount(order) })}</td>
      <td><strong>{money(orderTotal(order))}</strong></td>
      <td><StatusBadge tone={PAYMENT_TONE[order.paymentStatus]}>{t(`admin.orders.payment.${order.paymentStatus}`)}</StatusBadge></td>
      <td><StatusBadge tone={SUMMARY_TONE[summary]}>{t(`admin.orders.summary.${summary}`)}</StatusBadge></td>
      <td><AdminButton small onClick={onOpen}>{t("admin.orders.detail")}</AdminButton></td>
    </tr>
  );
}
