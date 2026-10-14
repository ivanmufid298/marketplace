"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserNotificationServices, notificationsInDatabase, type NotificationServices } from "./lib/services";
import type { AppNotification, NotificationsError } from "./lib/types";

// The signed-in buyer's notifications: what happened to their orders and what they still have to do. In the database
// when the build has Supabase credentials (or a fake is given); otherwise there are none.

/** How often the list is read again while the page is open and in front. */
export const POLL_MS = 60_000;

export type Notifications = {
  database: boolean;
  status: "loading" | "ready" | "error";
  error: NotificationsError | null;
  /** Newest first. */
  notifications: AppNotification[];
  unreadCount: number;
  reload: () => void;
  /** Marks one notification read, at once on screen and then in the database. */
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
};

export function useNotifications(userId: string | null, provided?: NotificationServices): Notifications {
  const database = provided !== undefined || notificationsInDatabase();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<NotificationServices | null>(provided ?? null);
  const [state, setState] = useState<{ status: Notifications["status"]; error: NotificationsError | null; list: AppNotification[] }>({ status: "ready", error: null, list: [] });

  useEffect(() => {
    if (database && !services) setServices(createBrowserNotificationServices());
  }, [database, services]);

  const load = useCallback(async () => {
    if (!services || !userId) return;
    const result = await services.repo.list();
    setState((current) => (result.ok ? { status: "ready", error: null, list: result.value } : { status: "error", error: result.error, list: current.list }));
  }, [services, userId]);

  useEffect(() => {
    if (!services || !userId) {
      setState({ status: "ready", error: null, list: [] });
      return;
    }
    // Loading when the buyer signs in is the point of this effect; the state it sets is the result.
    setState((current) => ({ ...current, status: "loading" }));
    void load();
  }, [services, userId, load]);

  // A notification can arrive while the buyer is on the page: read again every minute while the tab is in front, and as
  // soon as they come back to it.
  useEffect(() => {
    if (!services || !userId) return;
    const visible = () => document.visibilityState === "visible";
    const tick = () => visible() && void load();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [services, userId, load]);

  const markRead = useCallback(
    async (id: number) => {
      if (!services) return;
      setState((current) => ({ ...current, list: current.list.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
      const result = await services.repo.markRead([id]);
      // If it did not save, show the truth again instead of a read mark that will vanish on the next read.
      if (!result.ok) void load();
    },
    [load, services],
  );

  const markAllRead = useCallback(async () => {
    if (!services) return;
    setState((current) => ({ ...current, list: current.list.map((n) => ({ ...n, read: true })) }));
    const result = await services.repo.markAllRead();
    if (!result.ok) void load();
  }, [load, services]);

  const unreadCount = useMemo(() => state.list.filter((n) => !n.read).length, [state.list]);

  return { database, status: state.status, error: state.error, notifications: state.list, unreadCount, reload: () => void load(), markRead, markAllRead };
}
