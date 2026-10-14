import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATION_KINDS, type AppNotification, type NotificationKind, type NotificationsError, type NotificationsResult } from "./types";

// Reads the signed-in buyer's notifications and marks them read. The database shows each buyer only their own and lets
// them change nothing but the read time, so this code carries no permission checks of its own.

export type NotificationsDb = Pick<SupabaseClient, "from">;

/** How many the bell loads. Older ones are not lost, just not listed. */
export const NOTIFICATION_LIMIT = 50;

type Row = { id: number; kind: string; order_id: string | null; payload: unknown; created_at: string; read_at: string | null; resolved_at?: string | null };

const mapError = (error: { code?: string | null; message?: string | null }): NotificationsError => {
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(error.message ?? "")) return "network";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? "")) return "forbidden";
  return "unknown";
};

export function toNotification(row: Row): AppNotification | null {
  // A kind this version of the shop does not know (a newer one) is left out instead of shown wrongly.
  if (!(NOTIFICATION_KINDS as readonly string[]).includes(row.kind)) return null;
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};
  return { id: row.id, kind: row.kind as NotificationKind, orderId: row.order_id, payload, createdAt: row.created_at, read: row.read_at !== null, resolved: (row.resolved_at ?? null) !== null };
}

export function createNotificationRepository(db: NotificationsDb) {
  return {
    /** The newest notifications first. */
    async list(): Promise<NotificationsResult<AppNotification[]>> {
      const { data, error } = await db
        .from("notifications")
        .select("id, kind, order_id, payload, created_at, read_at, resolved_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(NOTIFICATION_LIMIT);
      if (error) return { ok: false, error: mapError(error) };
      return { ok: true, value: ((data ?? []) as Row[]).map(toNotification).filter((n): n is AppNotification => n !== null) };
    },

    /** Marks some notifications read. Ones already read keep their original time. */
    async markRead(ids: number[]): Promise<NotificationsResult<null>> {
      if (ids.length === 0) return { ok: true, value: null };
      const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).is("read_at", null);
      return error ? { ok: false, error: mapError(error) } : { ok: true, value: null };
    },

    /** Marks every unread notification read. */
    async markAllRead(): Promise<NotificationsResult<null>> {
      const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
      return error ? { ok: false, error: mapError(error) } : { ok: true, value: null };
    },
  };
}

export type NotificationRepository = ReturnType<typeof createNotificationRepository>;
