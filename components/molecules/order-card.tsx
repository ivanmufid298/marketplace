"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { MyReview, Order } from "@/lib/mock/orders";
import type { Product } from "@/lib/mock/store";
import { deriveStatus, total, type OrderStatus } from "@/lib/order-flow";
import { StatusPill, type PillTone } from "../atoms/badges";
import { Button } from "../atoms/button";
import { OrderItemLine } from "./order-item-line";

const STATUS_TONE: Record<OrderStatus, PillTone> = {
  pending: "pending",
  shipping: "progress",
  completed: "success",
  cancelled: "danger",
};

type OrderCardProps = {
  order: Order;
  products: Product[];
  reviews: Record<string, MyReview>;
  onSaveReview: (productId: number, review: MyReview) => boolean;
  onComplete: () => void;
};

export function OrderCard({ order, products, reviews, onSaveReview, onComplete }: OrderCardProps) {
  const [confirming, setConfirming] = useState(false);
  const status = deriveStatus(order);
  const lines = order.items.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ product, qty: item.qty }] : [];
  });

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <b>{t("store.orders.orderLabel", { number: order.number })}</b>
          <small>{order.date}</small>
        </div>
        <StatusPill tone={STATUS_TONE[status]}>{t(`store.orders.status.${status}`)}</StatusPill>
      </div>
      {lines.map(({ product, qty }) => (
        <OrderItemLine
          key={product.id}
          product={product}
          qty={qty}
          canReview={status === "completed"}
          review={reviews[`${order.number}:${product.id}`]}
          onSaveReview={(review) => onSaveReview(product.id, review)}
        />
      ))}
      <div className="order-foot">
        <span>{t("store.orders.shipping")} {money(order.shippingFee)}</span>
        <span>{t("store.orders.total")} <b>{money(total(order))}</b></span>
      </div>
      {status === "shipping" && (
        <div className="order-complete">
          {confirming ? (
            <>
              <p>{t("store.orders.complete.question")}</p>
              <div className="review-form-actions">
                <Button variant="secondary" onClick={() => setConfirming(false)}>{t("store.orders.complete.no")}</Button>
                <Button onClick={onComplete}>{t("store.orders.complete.yes")}</Button>
              </div>
            </>
          ) : (
            <Button onClick={() => setConfirming(true)}>{t("store.orders.complete.button")}</Button>
          )}
        </div>
      )}
    </article>
  );
}
