"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth";
import { describeNotification, useMyNotifications } from "@/features/notifications";
import { t } from "@/lib/i18n";
import { timeAgo } from "@/lib/time-ago";
import { Icon } from "../../atoms/icon";
import { IconButton } from "../../atoms/icon-button";

const agoText = (iso: string) => {
  const { unit, n } = timeAgo(iso);
  return t(`store.reviews.ago.${unit}`, { n });
};

/**
 * The bell in the admin top bar: payments whose transfer proof is waiting to be checked, and paid orders waiting to be sent. A number counts what this admin has not
 * read; choosing one opens the page where it is handled (payments, or orders). Where the panel keeps no notifications (the demo) it is the plain bell it always was.
 */
export function AdminNotificationBell() {
  const { user } = useAuth();
  const notifications = useMyNotifications();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { status, reload, markRead, markAllRead } = notifications;
  // Only what the admin has to act on belongs here; whatever else this account may have been told is the shop's business.
  const list = notifications.notifications.filter((n) => n.kind === "payment_submitted" || n.kind === "order_to_ship");
  const unread = list.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Opening the bell shows the latest, without waiting for the next scheduled read.
  useEffect(() => {
    if (open && user) reload();
    // `reload` changes with the list; only opening should refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  if (!user || !notifications.database) {
    return (
      <IconButton label={t("admin.shell.notifications")}>
        <span className="dot" />
        <Icon name="bell" />
      </IconButton>
    );
  }

  return (
    <div className="admin-notif" ref={root}>
      <IconButton label={unread > 0 ? t("admin.shell.notificationsUnread", { count: unread }) : t("admin.shell.notifications")} onClick={() => setOpen((v) => !v)}>
        <Icon name="bell" />
        {unread > 0 && <span className="count">{unread > 9 ? "9+" : unread}</span>}
      </IconButton>
      {open && (
        <div className="admin-notif-panel" role="dialog" aria-label={t("admin.shell.notificationsTitle")}>
          <div className="admin-notif-head">
            <b>{t("admin.shell.notificationsTitle")}</b>
            {unread > 0 && <button type="button" className="link-btn" onClick={() => void markAllRead()}>{t("admin.shell.notificationsMarkAll")}</button>}
          </div>
          {list.length === 0 && status === "loading" ? (
            <p className="admin-notif-note" role="status">{t("admin.shell.notificationsLoading")}</p>
          ) : list.length === 0 && status === "error" ? (
            <p className="admin-notif-note" role="alert">
              {t("admin.shell.notificationsError")} <button type="button" className="link-btn" onClick={reload}>{t("admin.shell.notificationsRetry")}</button>
            </p>
          ) : list.length === 0 ? (
            <p className="admin-notif-note">{t("admin.shell.notificationsEmpty")}</p>
          ) : (
            <ul>
              {list.map((n) => {
                const view = describeNotification(n);
                return (
                  <li key={n.id} className={n.read ? "" : "unread"}>
                    <Link href={n.kind === "order_to_ship" ? "/admin/orders" : "/admin/payments"} onClick={() => { void markRead(n.id); setOpen(false); }}>
                      <b>{view.title}</b>
                      <span>{view.body}</span>
                      <small>{agoText(n.createdAt)}</small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
