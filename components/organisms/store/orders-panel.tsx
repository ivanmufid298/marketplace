"use client";

import { t } from "@/lib/i18n";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { OrderCard } from "../../molecules/order-card";
import { useAuth } from "../../providers/auth-provider";
import { useStore } from "../../providers/store-provider";

export function OrdersPanel() {
  const { panels, closePanel, products, orders, completeOrder, myReviews, saveReview, signedIn } = useStore();
  const { openLogin } = useAuth();
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
        {!signedIn ? null : orders.length === 0 ? (
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
            />
          ))
        )}
      </div>
    </aside>
  );
}
