"use client";

import { useBuyerOrders } from "@/features/orders";
import { deriveStatus } from "@/lib/order-flow";

/** How many of the buyer's orders wait for them to tap "Pesanan selesai": paid, not cancelled, not yet marked done. */
export function useOrdersToComplete(): number {
  const { orders } = useBuyerOrders();
  return orders.filter((order) => deriveStatus(order) === "shipping").length;
}
