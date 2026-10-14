"use client";

import { useMyNotifications } from "@/features/notifications";
import { useCheckout } from "@/features/checkout";
import { useAuth } from "@/features/auth";
import { t } from "@/lib/i18n";
import { useUi } from "@/shared/ui-state/ui-provider";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";

/** The bell in the header. A number on it counts what the buyer has not read, plus a half-done checkout; it is not shown to a visitor who is not signed in, or when there is nothing to show (the demo). */
export function NotificationBell({ className = "" }: { className?: string }) {
  const { openPanel } = useUi();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const notifications = useMyNotifications();
  const { pendingCheckout } = useCheckout();
  // A checkout left half done counts as one more thing to do, even where the shop keeps no notifications (the demo).
  if (!signedIn || (!notifications.database && !pendingCheckout)) return null;
  const unread = notifications.unreadCount + (pendingCheckout ? 1 : 0);
  return (
    <IconButton className={`notif-bell ${className}`.trim()} label={unread > 0 ? t("store.notifications.bellUnread", { count: unread }) : t("store.notifications.bell")} onClick={() => openPanel("notifications")}>
      <Icon name="bell" />
      {unread > 0 && <span className="count">{unread > 9 ? "9+" : unread}</span>}
    </IconButton>
  );
}
