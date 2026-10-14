import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createNotificationRepository, type NotificationRepository } from "./notification-repository";

export type NotificationServices = { repo: Pick<NotificationRepository, "list" | "markRead" | "markAllRead"> };

/** True when the build has Supabase credentials, i.e. notifications live in the database. */
export const notificationsInDatabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export const createBrowserNotificationServices = (): NotificationServices => ({ repo: createNotificationRepository(getSupabaseBrowserClient()) });
