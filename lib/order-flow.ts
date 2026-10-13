import { money } from "@/lib/format";
import type { Payment } from "@/lib/mock/admin";
import type { Order } from "@/lib/mock/orders";

/** What both buyer and admin see. Derived from payment, buyer confirmation, and cancellation; never stored. */
export type OrderStatus = "pending" | "shipping" | "completed" | "cancelled";

/** The three steps of the normal flow, in order. */
export const STATUS_STEPS: Exclude<OrderStatus, "cancelled">[] = ["pending", "shipping", "completed"];

/**
 * What the buyer is told. Finer than OrderStatus, which the admin shares: while the payment is not accepted, the buyer
 * hears whether the transfer proof is still missing, is being checked, or was rejected.
 */
export type BuyerStatus = "awaiting_payment" | "verifying" | "rejected" | "expired" | "shipping" | "completed" | "cancelled";

/** Cancelled by the admin, or expired unpaid (both end the order, and the admin counts both as cancelled). */
export const isCancelled = (order: Order) => order.cancelNote !== undefined || order.expired === true;

export function deriveStatus(order: Order): OrderStatus {
  if (isCancelled(order)) return "cancelled";
  if (order.received) return "completed";
  if (order.payment === "success") return "shipping";
  return "pending";
}

export function buyerStatus(order: Order): BuyerStatus {
  if (order.expired && order.cancelNote === undefined) return "expired";
  const status = deriveStatus(order);
  if (status !== "pending") return status;
  if (order.awaitingProof) return "awaiting_payment";
  return order.payment === "failed" ? "rejected" : "verifying";
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
  // An order that still awaits its proof (or ran out of time) has nothing for the admin to decide.
  reviewable: !order.awaitingProof && !order.expired,
});
