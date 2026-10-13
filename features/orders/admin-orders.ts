"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/lib/mock/orders";
import { databaseConfigured } from "@/features/catalog";
import * as localOrders from "@/lib/orders-store";
import { createBrowserAdminOrderServices, type AdminOrderServices } from "./lib/services";
import type { OrderError, Outcome } from "./lib/types";
import type { OrdersStatus } from "./orders-provider";

// The orders the admin screens work with: every order, and what an admin can do to one. In the database when the build
// has Supabase credentials (or a fake is given), in this browser (the sample store) otherwise.

export type AdminOrders = {
  orders: Order[];
  status: OrdersStatus;
  /** True when the orders are in the database, where proofs exist and every action can be refused. */
  database: boolean;
  reload: () => void;
  acceptPayment: (order: Order) => Promise<Outcome<null>>;
  /** The reason is shown to the buyer, who has two hours to send a new proof. */
  rejectPayment: (order: Order, reason: string) => Promise<Outcome<null>>;
  cancelOrder: (order: Order, note: string) => Promise<Outcome<null>>;
  markRefunded: (order: Order) => Promise<Outcome<null>>;
  /** A short-lived link to a transfer proof (the newest by default). `null` when the order has none (the sample store keeps no files). */
  proofLink: (order: Order, index?: number) => Promise<Outcome<string | null>>;
  /** Puts the sample orders back (the sample store only). */
  resetSample: () => void;
};

const DONE: Outcome<null> = { ok: true, value: null };
const refused = (kind: OrderError["kind"]): Outcome<null> => ({ ok: false, error: { kind } });

export function useAdminOrders(provided?: AdminOrderServices): AdminOrders {
  const fromDatabase = provided !== undefined || databaseConfigured();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<AdminOrderServices | null>(provided ?? null);
  const [loaded, setLoaded] = useState<{ status: OrdersStatus; orders: Order[] }>({ status: fromDatabase ? "loading" : "ready", orders: [] });
  const stored = localOrders.useOrders();

  useEffect(() => {
    if (fromDatabase && !services) setServices(createBrowserAdminOrderServices());
  }, [fromDatabase, services]);

  const reload = useCallback(async () => {
    if (!services) return;
    setLoaded((current) => ({ ...current, status: "loading" }));
    const result = await services.repo.listAllOrders();
    setLoaded((current) => (result.ok ? { status: "ready", orders: result.value } : { status: "error", orders: current.orders }));
  }, [services]);

  useEffect(() => {
    // Loading the orders when the screens open is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  // A buyer may have paid or sent proof while the admin was elsewhere: coming back to the tab shows the latest.
  useEffect(() => {
    if (!services) return;
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [services, reload]);

  /** Runs an action in the database, then reloads so the screens show what the database now says. */
  const act = useCallback(
    async (run: (repo: AdminOrderServices["repo"]) => Promise<Outcome<null>>) => {
      if (!services) return refused("unknown");
      const result = await run(services.repo);
      if (result.ok) void reload();
      return result;
    },
    [reload, services],
  );

  const needsId = (order: Order) => (order.id ? null : refused("orderNotFound"));

  const acceptPayment = useCallback(
    async (order: Order) => {
      if (!fromDatabase) return localOrders.acceptPayment(order.number) ? DONE : refused("notReviewable");
      return needsId(order) ?? act((repo) => repo.acceptPayment(order.id as string));
    },
    [act, fromDatabase],
  );
  const rejectPayment = useCallback(
    async (order: Order, reason: string) => {
      if (!reason.trim()) return refused("reasonRequired");
      if (!fromDatabase) return localOrders.rejectPayment(order.number, reason.trim()) ? DONE : refused("notReviewable");
      return needsId(order) ?? act((repo) => repo.rejectPayment(order.id as string, reason.trim()));
    },
    [act, fromDatabase],
  );
  const cancelOrder = useCallback(
    async (order: Order, note: string) => {
      if (!note.trim()) return refused("noteRequired");
      if (!fromDatabase) return localOrders.cancelOrder(order.number, note) ? DONE : refused("notCancellable");
      return needsId(order) ?? act((repo) => repo.cancelOrder(order.id as string, note.trim()));
    },
    [act, fromDatabase],
  );
  const markRefunded = useCallback(
    async (order: Order) => {
      if (!fromDatabase) return localOrders.markRefunded(order.number) ? DONE : refused("notRefundable");
      return needsId(order) ?? act((repo) => repo.markRefunded(order.id as string));
    },
    [act, fromDatabase],
  );

  const proofLink = useCallback(
    async (order: Order, index?: number): Promise<Outcome<string | null>> => {
      const proof = order.proofs?.[index ?? (order.proofs?.length ?? 0) - 1];
      if (!fromDatabase || !proof || !services) return { ok: true, value: null };
      return services.repo.proofLink(proof.objectKey);
    },
    [fromDatabase, services],
  );

  return {
    orders: fromDatabase ? loaded.orders : stored,
    status: fromDatabase ? loaded.status : "ready",
    database: fromDatabase,
    reload: () => void reload(),
    acceptPayment,
    rejectPayment,
    cancelOrder,
    markRefunded,
    proofLink,
    resetSample: localOrders.resetOrders,
  };
}
