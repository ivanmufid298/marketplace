"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/features/auth";
import { databaseConfigured } from "@/features/catalog";
import type { Order } from "@/lib/mock/orders";
import { SHIPPING_OPTIONS } from "@/lib/mock/store";
import * as localOrders from "@/lib/orders-store";
import { createBrowserOrderServices, type OrderServices } from "./lib/services";
import type { Outcome, PlaceOrderInput, PlacedOrder, ShippingMethod } from "./lib/types";

// The buyer's orders: in the database when the build has Supabase credentials, in this browser (the sample store the
// admin demo also reads) otherwise. Checkout, "Pesanan saya", and the status of the buyer's own orders go through here.

export type OrdersStatus = "loading" | "ready" | "error";

type OrdersContextValue = {
  /** The signed-in buyer's orders, newest first. */
  orders: Order[];
  ordersStatus: OrdersStatus;
  /** What the checkout offers. In the database mode these are the shop's real rates. */
  shippingMethods: ShippingMethod[];
  /** Places an order from a checkout. The database decides prices, fees, and stock; see place_order. */
  placeOrder: (input: PlaceOrderInput) => Promise<Outcome<PlacedOrder>>;
  /** Sends a transfer proof for an order that has none (or whose proof was rejected). */
  sendProof: (order: Order, file: File) => Promise<Outcome<null>>;
  /** The buyer taps "Pesanan selesai". Only the local demo can do this so far. */
  confirmReceived: (orderNumber: string) => boolean;
  reload: () => void;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useBuyerOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useBuyerOrders must be used inside <OrdersProvider>");
  return ctx;
}

const SAMPLE_METHODS: ShippingMethod[] = SHIPPING_OPTIONS.map((o) => ({ value: o.value, label: o.label, note: o.note, cost: o.cost }));

type Loaded = { status: OrdersStatus; orders: Order[] };

export function OrdersProvider({ children, services: provided }: { children: ReactNode; services?: OrderServices }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const fromDatabase = provided !== undefined || databaseConfigured();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<OrderServices | null>(provided ?? null);
  const [loaded, setLoaded] = useState<Loaded>({ status: fromDatabase ? "loading" : "ready", orders: [] });
  // Until the real rates arrive the sample ones (which match what the database starts with) are shown.
  const [methods, setMethods] = useState<ShippingMethod[]>(SAMPLE_METHODS);
  const stored = localOrders.useOrders();

  useEffect(() => {
    if (fromDatabase && !services) setServices(createBrowserOrderServices());
  }, [fromDatabase, services]);

  useEffect(() => {
    if (!services) return;
    let current = true;
    void services.repo.listShippingMethods().then((result) => {
      if (current && result.ok && result.value.length > 0) setMethods(result.value);
    });
    return () => {
      current = false;
    };
  }, [services]);

  const reload = useCallback(async () => {
    if (!services || !userId) return;
    setLoaded((current) => ({ ...current, status: "loading" }));
    const result = await services.repo.listMyOrders(userId);
    setLoaded((current) => (result.ok ? { status: "ready", orders: result.value } : { status: "error", orders: current.orders }));
  }, [services, userId]);

  useEffect(() => {
    if (!fromDatabase) return;
    if (!userId) {
      setLoaded({ status: "ready", orders: [] });
      return;
    }
    // Loading the orders when the buyer signs in is the point of this effect; the state it sets is the result.
    void reload();
  }, [fromDatabase, userId, reload]);

  const placeOrder = useCallback(
    async (input: PlaceOrderInput): Promise<Outcome<PlacedOrder>> => {
      if (!fromDatabase) {
        if (!user) return { ok: false, error: { kind: "notSignedIn" } };
        const number = localOrders.createOrder({
          buyerId: user.id,
          buyer: input.recipient || user.name,
          phone: input.phone,
          address: [input.address, input.city, input.postcode].map((part) => part.trim()).filter(Boolean).join(", "),
          items: input.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
          shippingMethod: methods.find((m) => m.value === input.shippingCode)?.label ?? methods[0].label,
          shippingFee: (methods.find((m) => m.value === input.shippingCode) ?? methods[0]).cost,
        });
        return { ok: true, value: { number, proofSent: true } };
      }
      if (!services) return { ok: false, error: { kind: "unknown" } };
      const result = await services.repo.placeOrder(input);
      if (result.ok) void reload();
      return result;
    },
    [fromDatabase, methods, reload, services, user],
  );

  const sendProof = useCallback(
    async (order: Order, file: File): Promise<Outcome<null>> => {
      if (!services || !order.id) return { ok: false, error: { kind: "unknown" } };
      const result = await services.repo.sendProof(order.id, file);
      if (result.ok) void reload();
      return result;
    },
    [reload, services],
  );

  const confirmReceived = useCallback((orderNumber: string) => (fromDatabase ? false : localOrders.confirmReceived(orderNumber)), [fromDatabase]);

  const orders = useMemo(() => (fromDatabase ? loaded.orders : userId ? stored.filter((o) => o.buyerId === userId) : []), [fromDatabase, loaded.orders, stored, userId]);

  const value: OrdersContextValue = {
    orders,
    ordersStatus: fromDatabase ? loaded.status : "ready",
    shippingMethods: methods,
    placeOrder,
    sendProof,
    confirmReceived,
    reload: () => void reload(),
  };
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}
