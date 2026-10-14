/** Every kind of notification a buyer can get. The database allows exactly these. */
export const NOTIFICATION_KINDS = ["payment_needed", "payment_rejected", "payment_accepted", "order_cancelled", "refund_done", "order_expired", "review_invite", "payment_expiring"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Kinds that ask the buyer to do something. The rest only tell them something. */
export const ACTIONABLE_KINDS: readonly NotificationKind[] = ["payment_needed", "payment_rejected", "payment_expiring", "review_invite"];

export type AppNotification = {
  id: number;
  kind: NotificationKind;
  orderId: string | null;
  /** The few facts the wording needs: the order number, a deadline, a reason. */
  payload: Record<string, unknown>;
  /** ISO time. */
  createdAt: string;
  read: boolean;
  /** There is nothing left to do about it (the proof was sent, the order ended). The bell does not list it any more. */
  resolved: boolean;
};

export type NotificationsError = "network" | "forbidden" | "unknown";
export type NotificationsResult<T> = { ok: true; value: T } | { ok: false; error: NotificationsError };
