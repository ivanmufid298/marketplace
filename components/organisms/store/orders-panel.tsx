"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { OrderCard } from "../../molecules/order-card";
import { useAuth } from "@/features/auth";
import { useBuyerOrders } from "@/features/orders";
import { useStore } from "../../providers/store-provider";

export function OrdersPanel() {
  const { panels, closePanel, products, orders, completeOrder, myReviews, saveReview, signedIn, sendOrderProof } = useStore();
  const { ordersStatus, reload } = useBuyerOrders();
  const { openLogin } = useAuth();
  const [sendingFor, setSendingFor] = useState<string | null>(null);

  // Opening the panel shows fresh orders: the admin may have decided on a proof, or an order may have run out of time.
  const open = panels.orders;
  useEffect(() => {
    if (open && signedIn) reload();
    // `reload` changes whenever the orders do; only opening the panel should refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signedIn]);
  return (
    <aside className={`drawer${panels.orders ? " open" : ""}`} id="ordersPanel" aria-hidden={!panels.orders}>
      <div className="overlay" onClick={() => closePanel("orders")} />
      <div className="panel">
        <div className="panel-top">
          <h2>{t("store.orders.title")}</h2>
          <CloseButton label={t("common.close")} onClick={() => closePanel("orders")} />
        </div>
        {!signedIn ? (
          <div className="cart-empty">
            {t("store.auth.ordersPrompt")}
            <div style={{ marginTop: 14 }}>
              <Button onClick={() => openLogin("orders")}>{t("store.auth.promptAction")}</Button>
            </div>
          </div>
        ) : (
          <p className="orders-hint">{t("store.orders.hint")}</p>
        )}
        {!signedIn ? null : orders.length === 0 && ordersStatus === "loading" ? (
          <div className="cart-empty" role="status">{t("store.orders.loading")}</div>
        ) : orders.length === 0 && ordersStatus === "error" ? (
          <div className="cart-empty" role="alert">
            {t("store.orders.loadError")} <button type="button" className="link-btn" onClick={reload}>{t("store.orders.retry")}</button>
          </div>
        ) : orders.length === 0 ? (
          <div className="cart-empty">{t("store.orders.empty")}</div>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.number}
              order={order}
              products={products}
              reviews={myReviews}
              onSaveReview={(productId, review) => saveReview(order.number, productId, review)}
              onComplete={() => completeOrder(order.number)}
              onSendProof={order.id ? async (file) => {
                setSendingFor(order.number);
                await sendOrderProof(order, file);
                setSendingFor(null);
              } : undefined}
              sendingProof={sendingFor === order.number}
            />
          ))
        )}
      </div>
    </aside>
  );
}
