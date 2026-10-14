"use client";

import { useCheckout } from "@/features/checkout";
import { useAuth } from "@/features/auth";
import { useEffect } from "react";
import { describeNotification, useBuyerNotifications, type AppNotification } from "@/features/notifications";
import { t } from "@/lib/i18n";
import { timeAgo } from "@/lib/time-ago";
import { useUi } from "@/shared/ui-state/ui-provider";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";

const agoText = (iso: string) => {
  const { unit, n } = timeAgo(iso);
  return t(`store.reviews.ago.${unit}`, { n });
};

/** What happened to the buyer's orders, newest first, with the things still to do marked. Choosing one opens "Pesanan saya". */
export function NotificationsPanel() {
  const { panels, openPanel, closePanel } = useUi();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const notifications = useBuyerNotifications();
  const { pendingCheckout, resumeCheckout } = useCheckout();
  const { markRead } = notifications;
  /** The buyer chose a notification: it is marked read and "Pesanan saya" opens, where the thing to do is. */
  const openNotification = (notification: AppNotification) => {
    void markRead(notification.id);
    closePanel("notifications");
    openPanel("orders");
  };
  const { status, notifications: list, unreadCount, reload, markAllRead } = notifications;

  // Opening the panel shows the latest, without waiting for the next scheduled read.
  const open = panels.notifications;
  useEffect(() => {
    if (open && signedIn) reload();
    // `reload` changes with the list; only opening the panel should refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn]);

  return (
    <aside className={`drawer${open ? " open" : ""}`} id="notificationsPanel" aria-hidden={!open}>
      <div className="overlay" onClick={() => closePanel("notifications")} />
      <div className="panel">
        <div className="panel-top">
          <h2>{t("store.notifications.title")}</h2>
          <CloseButton label={t("common.close")} onClick={() => closePanel("notifications")} />
        </div>

        {!signedIn ? (
          <div className="cart-empty">{t("store.notifications.signIn")}</div>
        ) : list.length === 0 && !pendingCheckout && status === "loading" ? (
          <div className="cart-empty" role="status">{t("store.notifications.loading")}</div>
        ) : list.length === 0 && !pendingCheckout && status === "error" ? (
          <div className="cart-empty" role="alert">
            {t("store.notifications.loadError")} <button type="button" className="link-btn" onClick={reload}>{t("store.notifications.retry")}</button>
          </div>
        ) : list.length === 0 && !pendingCheckout ? (
          <div className="cart-empty">{t("store.notifications.empty")}</div>
        ) : (
          <>
            {unreadCount > 0 && (
              <div className="notif-tools">
                <button type="button" className="link-btn" onClick={() => void markAllRead()}>{t("store.notifications.markAll")}</button>
              </div>
            )}
            <ul className="notif-list">
              {pendingCheckout && (
                // Not a record in the database: it is there while the checkout is half done, and gone when it is finished.
                <li className="notif unread urgent" data-kind="checkout_unfinished">
                  <button type="button" className="notif-main" onClick={resumeCheckout}>
                    <span className="notif-dot" aria-label={t("store.notifications.toNew")} />
                    <span className="notif-title">{t("store.notifications.checkout.title")}</span>
                    <span className="notif-body">{t(pendingCheckout.step === 3 ? "store.notifications.checkout.bodyPayment" : "store.notifications.checkout.bodyShipping")}</span>
                  </button>
                  <Button className="notif-action" onClick={resumeCheckout}>{t("store.notifications.checkout.action")}</Button>
                </li>
              )}
              {list.map((n) => {
                const view = describeNotification(n);
                return (
                  <li key={n.id} className={`notif${n.read ? "" : " unread"}${view.urgent ? " urgent" : ""}`}>
                    <button type="button" className="notif-main" onClick={() => openNotification(n)}>
                      {!n.read && <span className="notif-dot" aria-label={t("store.notifications.toNew")} />}
                      <span className="notif-title">{view.title}</span>
                      <span className="notif-body">{view.body}</span>
                      <span className="notif-time">{agoText(n.createdAt)}</span>
                    </button>
                    {view.actionLabel && !n.read && <Button className="notif-action" onClick={() => openNotification(n)}>{view.actionLabel}</Button>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
