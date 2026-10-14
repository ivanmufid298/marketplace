"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { MyReview } from "@/lib/mock/orders";
import type { Product } from "@/lib/mock/store";
import { Button } from "../atoms/button";
import { ProductImage } from "../atoms/product-image";
import { ReviewForm } from "./review-form";
import { stars } from "./review-summary";

type OrderItemLineProps = {
  product: Product;
  qty: number;
  /** Only delivered orders can be reviewed. */
  canReview: boolean;
  review?: MyReview;
  /** Returns false when the review was rejected (e.g. missing rating), so the form stays open. */
  onSaveReview: (review: MyReview) => boolean | Promise<boolean>;
};

export function OrderItemLine({ product: p, qty, canReview, review, onSaveReview }: OrderItemLineProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="order-item">
      <ProductImage product={p} className="order-thumb" sizes="56px" />
      <div className="order-item-main">
        <b>{p.name}</b>
        <small>{t("store.orders.itemQty", { qty })} · {money(p.price)}</small>

        {canReview && editing && (
          <ReviewForm
            initial={review}
            onCancel={() => setEditing(false)}
            onSubmit={async (next) => {
              if (await onSaveReview(next)) setEditing(false);
            }}
          />
        )}

        {canReview && !editing && review && (
          <div className="my-review">
            <div className="my-review-head">
              <span>{t("store.orders.review.yours")}</span>
              <span className="stars">{stars(review.rating)}</span>
            </div>
            <p>{review.text}</p>
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>{t("store.orders.review.edit")}</button>
          </div>
        )}

        {canReview && !editing && !review && (
          <Button variant="secondary" className="review-cta" onClick={() => setEditing(true)}>{t("store.orders.review.write")}</Button>
        )}
      </div>
    </div>
  );
}
