import { money } from "@/lib/format";
import type { Payment } from "@/lib/mock/admin";
import type { Order } from "@/lib/mock/orders";

/** What both buyer and admin see. Derived from payment, buyer confirmation, and cancellation; never stored. */
export type OrderStatus = "pending" | "shipping" | "completed" | "cancelled";

/** The three steps of the normal flow, in order. */
export const STATUS_STEPS: Exclude<OrderStatus, "cancelled">[] = ["pending", "shipping", "completed"];

export const isCancelled = (order: Order) => order.cancelNote !== undefined;

export function deriveStatus(order: Order): OrderStatus {
  if (isCancelled(order)) return "cancelled";
  if (order.received) return "completed";
  if (order.payment === "success") return "shipping";
  return "pending";
}

/** Admin can cancel until the buyer has confirmed receipt. */
export const canCancel = (order: Order) => !isCancelled(order) && !order.received;

export const subtotal = (order: Order) => order.items.reduce((sum, i) => sum + i.qty * i.price, 0);
export const total = (order: Order) => subtotal(order) + order.shippingFee;
export const itemCount = (order: Order) => order.items.reduce((sum, i) => sum + i.qty, 0);

/** The payments table shows one row per order. */
export const toPayment = (order: Order): Payment => ({
  id: `MKP-${order.number}`,
  name: order.buyer,
  total: money(total(order)),
  time: order.date,
  status: order.payment,
});
