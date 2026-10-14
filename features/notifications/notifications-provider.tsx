"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/features/auth";
import { useNotifications, type Notifications } from "./use-notifications";
import type { NotificationServices } from "./lib/services";

const NotificationsContext = createContext<Notifications | null>(null);

/** What the bell and the panel both read: the signed-in buyer's notifications, loaded once. */
export function useBuyerNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useBuyerNotifications must be used inside <NotificationsProvider>");
  return ctx;
}

/** Tests pass fakes for the notifications, which also switches them to the database path. */
export function NotificationsProvider({ children, services }: { children: ReactNode; services?: NotificationServices }) {
  const { user } = useAuth();
  const notifications = useNotifications(user?.id ?? null, services);
  return <NotificationsContext.Provider value={notifications}>{children}</NotificationsContext.Provider>;
}
