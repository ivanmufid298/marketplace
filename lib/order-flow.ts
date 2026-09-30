import type { AdminOrder, FulfillmentGroup, FulfillmentKind, FulfillmentStatus, OrderLine, PoStatus, ReadyStatus } from "@/lib/mock/orders";

/** Fulfillment steps in order (PRD section 12). `cancelled` is a side exit, not a step. */
export const READY_FLOW: ReadyStatus[] = ["unfulfilled", "processing", "packed", "shipped", "delivered"];
export const PO_FLOW: PoStatus[] = ["unfulfilled", "ordered_abroad", "shipped_to_indonesia", "arrived_at_warehouse", "packed", "shipped_to_buyer", "delivered"];

export const flowFor = (kind: FulfillmentKind): FulfillmentStatus[] => (kind === "ready" ? READY_FLOW : PO_FLOW);

const SHIPPED: FulfillmentStatus[] = ["shipped", "shipped_to_buyer", "delivered"];

export const isShipped = (group: FulfillmentGroup) => SHIPPED.includes(group.status);
export const isCancelled = (group: FulfillmentGroup) => group.status === "cancelled";

/** The next step for a group, or null when it is finished or cancelled. */
export function nextStatus(group: FulfillmentGroup): FulfillmentStatus | null {
  if (isCancelled(group)) return null;
  const flow = flowFor(group.kind);
  const index = flow.indexOf(group.status);
  return index >= 0 && index < flow.length - 1 ? flow[index + 1] : null;
}

/** An order is cancelled as a whole, or via expiry, refund, or every group being cancelled. */
export const isOrderCancelled = (order: AdminOrder) =>
  order.paymentStatus === "expired" || order.paymentStatus === "refund_pending" || order.paymentStatus === "refunded" || order.groups.every(isCancelled);

/** Normal cancellation is only allowed while nothing has been shipped (PRD section 12). */
export const canCancel = (order: AdminOrder) => !isOrderCancelled(order) && order.groups.every((g) => !isShipped(g));

/** Fulfillment only starts once payment is confirmed. */
export const canFulfill = (order: AdminOrder) => order.paymentStatus === "paid" && !isOrderCancelled(order);

export type OrderSummary = "pending_payment" | "payment_review" | "processing" | "partially_shipped" | "completed" | "cancelled";

/** Buyer-facing summary derived from payment and all fulfillment groups; never stored as its own source of truth. */
export function deriveSummary(order: AdminOrder): OrderSummary {
  if (isOrderCancelled(order)) return "cancelled";
  if (order.paymentStatus === "under_review") return "payment_review";
  if (order.paymentStatus !== "paid") return "pending_payment";
  if (order.groups.every((g) => g.status === "delivered")) return "completed";
  if (order.groups.some(isShipped)) return "partially_shipped";
  return "processing";
}

export const lineTotal = (line: OrderLine) => line.qty * line.price;
export const groupSubtotal = (group: FulfillmentGroup) => group.items.reduce((sum, l) => sum + lineTotal(l), 0);
export const orderSubtotal = (order: AdminOrder) => order.groups.reduce((sum, g) => sum + groupSubtotal(g), 0);
export const orderShipping = (order: AdminOrder) => order.groups.reduce((sum, g) => sum + g.shippingFee, 0);
export const orderTotal = (order: AdminOrder) => orderSubtotal(order) + orderShipping(order);
export const itemCount = (order: AdminOrder) => order.groups.reduce((sum, g) => sum + g.items.reduce((n, l) => n + l.qty, 0), 0);
