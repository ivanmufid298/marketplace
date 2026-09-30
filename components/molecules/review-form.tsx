"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import type { MyReview } from "@/lib/mock/store";
import { Button } from "../atoms/button";
import { StarRatingInput } from "./star-rating-input";

type ReviewFormProps = {
  /** Existing review when editing. */
  initial?: MyReview;
  onSubmit: (review: MyReview) => void;
  onCancel: () => void;
};

/** Rating stars plus a text area for writing or editing a product review. */
export function ReviewForm({ initial, onSubmit, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [text, setText] = useState(initial?.text ?? "");

  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ rating, text: text.trim() });
      }}
    >
      <div>
        <span className="review-form-label">{t("store.orders.review.ratingLabel")}</span>
        <StarRatingInput
          value={rating}
          onChange={setRating}
          groupLabel={t("store.orders.review.ratingLabel")}
          starLabel={(n) => t("store.orders.review.ratingStar", { n })}
        />
      </div>
      <label>
        <span className="review-form-label">{t("store.orders.review.textLabel")}</span>
        <textarea placeholder={t("store.orders.review.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="review-form-actions">
        <Button variant="secondary" onClick={onCancel}>{t("common.cancel")}</Button>
        <Button type="submit">{initial ? t("store.orders.review.update") : t("store.orders.review.submit")}</Button>
      </div>
    </form>
  );
}
