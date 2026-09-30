import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Order } from "@/lib/mock/orders";
import { deriveStatus, itemCount, total, type OrderStatus } from "@/lib/order-flow";
import { AdminButton } from "../atoms/admin-button";
import { StatusBadge, type StatusTone } from "../atoms/badges";

export const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending: "pending",
  shipping: "progress",
  completed: "success",
  cancelled: "failed",
};

export function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const status = deriveStatus(order);
  return (
    <tr>
      <td><strong>{t("admin.orders.orderLabel", { number: order.number })}</strong><span className="sub">{order.date}</span><span className="sub mobile-only">{order.buyer}</span></td>
      <td className="hide-mobile">{order.buyer}</td>
      <td className="hide-mobile">{t("admin.orders.itemCount", { count: itemCount(order) })}</td>
      <td className="hide-mobile"><strong>{money(total(order))}</strong></td>
      <td><StatusBadge tone={STATUS_TONE[status]}>{t(`admin.orders.status.${status}`)}</StatusBadge></td>
      <td><AdminButton small onClick={onOpen}>{t("admin.orders.detail")}</AdminButton></td>
    </tr>
  );
}
