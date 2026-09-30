import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime } from "@/lib/format";
import { canCancel, isCancelled } from "@/lib/order-flow";
import { seedOrders, type HistoryEntry, type Order, type OrderItem } from "@/lib/mock/orders";

// A tiny client-side stand-in for the orders table. The storefront and the admin read the same data, so accepting a
// payment in the admin changes what the buyer sees. State is kept in localStorage so it survives reloads and syncs
// across tabs. Replace this module with real queries once the database exists.

const STORAGE_KEY = "marketplace-orders-v1";
const ADMIN = "Admin";

let orders: Order[] = seedOrders;
let started = false;
const listeners = new Set<() => void>();

function read(): Order[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Order[]) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: Order[]) {
  orders = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the state still works for this tab.
  }
  emit();
}

function start() {
  if (started) return;
  started = true;
  const stored = read();
  if (stored) orders = stored;
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    orders = read() ?? seedOrders;
    emit();
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  // The first subscription may have replaced the seed with stored data.
  listener();
  return () => listeners.delete(listener);
}

/** All orders, newest first. Renders the seed on the server and on first paint, then the stored data. */
export function useOrders(): Order[] {
  return useSyncExternalStore(subscribe, () => orders, () => seedOrders);
}

const entry = (event: HistoryEntry["event"], actor: string, note?: string): HistoryEntry => ({ at: formatDateTime(), event, actor, ...(note ? { note } : {}) });

function update(number: string, change: (order: Order) => Order | null) {
  const current = orders.find((o) => o.number === number);
  const next = current && change(current);
  if (!next) return false;
  commit(orders.map((o) => (o.number === number ? next : o)));
  return true;
}

/** Admin accepted the transfer proof: the order moves to "Barang sedang dikirim". */
export const acceptPayment = (number: string) =>
  update(number, (o) => (o.payment === "pending" && !isCancelled(o) ? { ...o, payment: "success", history: [...o.history, entry("payment_accepted", ADMIN)] } : null));

/** Admin rejected the transfer proof: the order stays "Pending". */
export const rejectPayment = (number: string) =>
  update(number, (o) => (o.payment === "pending" && !isCancelled(o) ? { ...o, payment: "failed", history: [...o.history, entry("payment_rejected", ADMIN)] } : null));

/** Buyer tapped "Pesanan selesai". Only possible once the order is paid. */
export const confirmReceived = (number: string) =>
  update(number, (o) => (o.payment === "success" && !o.received && !isCancelled(o) ? { ...o, received: true, history: [...o.history, entry("received", o.buyer)] } : null));

/** Admin cancelled the order. A paid order needs a refund afterwards. */
export const cancelOrder = (number: string, note: string) =>
  update(number, (o) =>
    canCancel(o) && note.trim()
      ? { ...o, cancelNote: note.trim(), refund: o.payment === "success" ? "pending" : undefined, history: [...o.history, entry("cancelled", ADMIN, note.trim())] }
      : null,
  );

export const markRefunded = (number: string) =>
  update(number, (o) => (o.refund === "pending" ? { ...o, refund: "done", history: [...o.history, entry("refunded", ADMIN)] } : null));

export type NewOrder = {
  buyerId: string;
  buyer: string;
  phone: string;
  address: string;
  items: OrderItem[];
  shippingMethod: string;
  shippingFee: number;
};

/** Creates a pending order from a checkout and returns its number. */
export function createOrder(input: NewOrder): string {
  const number = String(Math.max(0, ...orders.map((o) => Number(o.number))) + 1);
  const order: Order = { ...input, number, date: formatDate(), payment: "pending", received: false, history: [entry("created", input.buyer)] };
  commit([order, ...orders]);
  return number;
}

export function resetOrders() {
  commit(seedOrders);
}
