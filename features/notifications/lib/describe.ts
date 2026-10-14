import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { ACTIONABLE_KINDS, type AppNotification } from "./types";

/** What the bell shows for one notification. The wording lives in content/id.json (store.notifications.kinds). */
export type NotificationView = { title: string; body: string; actionLabel: string | null; urgent: boolean };

/** "14.35" in Asia/Jakarta, for a deadline; empty when the notification has none. */
const timeOf = (value: unknown) => (typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? (formatDateTime(new Date(value)).split(", ")[1] ?? "") : "");
const text = (value: unknown) => (typeof value === "string" ? value : "");

export function describeNotification(n: AppNotification): NotificationView {
  const number = text(n.payload.number);
  const base = { number };
  const actionable = ACTIONABLE_KINDS.includes(n.kind);
  // An open request to the buyer is urgent only until they have dealt with it (it is marked read then).
  const urgent = actionable && !n.read && n.kind !== "review_invite";
  switch (n.kind) {
    case "payment_needed":
      return { title: t("store.notifications.kinds.payment_needed.title", base), body: t("store.notifications.kinds.payment_needed.body", { time: timeOf(n.payload.expires_at) }), actionLabel: t("store.notifications.kinds.payment_needed.action"), urgent };
    case "payment_rejected":
      return { title: t("store.notifications.kinds.payment_rejected.title", base), body: t("store.notifications.kinds.payment_rejected.body", { reason: text(n.payload.reason), time: timeOf(n.payload.reupload_until) }), actionLabel: t("store.notifications.kinds.payment_rejected.action"), urgent };
    case "payment_accepted":
      return { title: t("store.notifications.kinds.payment_accepted.title", base), body: t("store.notifications.kinds.payment_accepted.body"), actionLabel: null, urgent };
    case "order_cancelled":
      return { title: t("store.notifications.kinds.order_cancelled.title", base), body: t(n.payload.refund === true ? "store.notifications.kinds.order_cancelled.bodyRefund" : "store.notifications.kinds.order_cancelled.body", { note: text(n.payload.note) }), actionLabel: null, urgent };
    case "refund_done":
      return { title: t("store.notifications.kinds.refund_done.title", base), body: t("store.notifications.kinds.refund_done.body"), actionLabel: null, urgent };
    case "order_expired":
      return { title: t("store.notifications.kinds.order_expired.title", base), body: t("store.notifications.kinds.order_expired.body"), actionLabel: null, urgent };
    case "review_invite":
      return { title: t("store.notifications.kinds.review_invite.title", base), body: t("store.notifications.kinds.review_invite.body"), actionLabel: t("store.notifications.kinds.review_invite.action"), urgent };
  }
}
