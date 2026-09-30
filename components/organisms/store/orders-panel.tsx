"use client";

import { t } from "@/lib/i18n";
import { ORDERS } from "@/lib/mock/store";
import { CloseButton } from "../../atoms/close-button";
import { OrderCard } from "../../molecules/order-card";
import { useStore } from "../../providers/store-provider";

export function OrdersPanel() {
  const { panels, closePanel, products, myReviews, saveReview } = useStore();
  return (
    <aside className={`drawer${panels.orders ? " open" : ""}`} id="ordersPanel" aria-hidden={!panels.orders}>
      <div className="overlay" onClick={() => closePanel("orders")} />
      <div className="panel">
        <div className="panel-top">
          <h2>{t("store.orders.title")}</h2>
          <CloseButton label={t("common.close")} onClick={() => closePanel("orders")} />
        </div>
        <p className="orders-hint">{t("store.orders.hint")}</p>
        {ORDERS.length === 0 ? (
          <div className="cart-empty">{t("store.orders.empty")}</div>
        ) : (
          ORDERS.map((order) => (
            <OrderCard
              key={order.number}
              order={order}
              products={products}
              reviews={myReviews}
              onSaveReview={(productId, review) => saveReview(order.number, productId, review)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
