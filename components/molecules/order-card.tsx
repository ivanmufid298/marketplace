"use client";

import { useState } from "react";
import { formatDateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { MyReview, Order } from "@/lib/mock/orders";
import type { Product } from "@/lib/mock/store";
import { buyerStatus, deriveStatus, total, type BuyerStatus } from "@/lib/order-flow";
import { StatusPill, type PillTone } from "../atoms/badges";
import { Button } from "../atoms/button";
import { OrderItemLine } from "./order-item-line";
import { UploadField } from "./upload-field";

const STATUS_TONE: Record<BuyerStatus, PillTone> = {
  awaiting_payment: "pending",
  verifying: "progress",
  rejected: "danger",
  expired: "danger",
  shipping: "progress",
  completed: "success",
  cancelled: "danger",
};

type OrderCardProps = {
  order: Order;
  products: Product[];
  reviews: Record<string, MyReview>;
  onSaveReview: (productId: number, review: MyReview) => boolean | Promise<boolean>;
  onComplete: () => void;
  /** Sends a transfer proof for an order that has none yet. Only database orders can use it. */
  onSendProof?: (file: File) => void;
  /** True while a proof is being sent. */
  sendingProof?: boolean;
};

/** "14.35" in Asia/Jakarta, for a deadline. */
const timeOf = (iso: string) => formatDateTime(new Date(iso)).split(", ")[1] ?? "";

export function OrderCard({ order, products, reviews, onSaveReview, onComplete, onSendProof, sendingProof = false }: OrderCardProps) {
  const [confirming, setConfirming] = useState(false);
  const status = deriveStatus(order);
  const label = buyerStatus(order);
  // A database order carries a copy of each product as it was bought, which is what the order should show. A sample
  // order uses the catalog; either way the price shown is the one paid, not today's.
  const lines = order.items.flatMap((item) => {
    if (item.name !== undefined) {
      const copy: Product = { id: item.productId, name: item.name, cat: "", price: item.price, stock: 0, desc: "", photos: item.photos ?? [] };
      return [{ product: copy, qty: item.qty }];
    }
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ product: { ...product, price: item.price }, qty: item.qty }] : [];
  });

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <b>{t("store.orders.orderLabel", { number: order.number })}</b>
          <small>{order.date}</small>
        </div>
        <StatusPill tone={STATUS_TONE[label]}>{t(`store.orders.status.${label}`)}</StatusPill>
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
      {label === "rejected" && order.rejectionReason && <p className="order-rejection">{t("store.orders.proof.rejected", { reason: order.rejectionReason })}</p>}
      {order.canSendProof && onSendProof && (
        <div className="order-proof">
          {order.payBefore && <p className="order-proof-deadline">{t("store.orders.proof.deadline", { time: timeOf(order.payBefore) })}</p>}
          <UploadField
            title={sendingProof ? t("store.orders.proof.sending") : t("store.orders.proof.title")}
            hint={t("store.orders.proof.hint")}
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            onFile={(file, input) => {
              if (file && !sendingProof) onSendProof(file);
              input.value = "";
            }}
          />
        </div>
      )}
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
