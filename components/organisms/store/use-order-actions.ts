"use client";

import { useCallback, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { INITIAL_MY_REVIEWS, type MyReview, type Order } from "@/lib/mock/orders";
import { useAuth } from "@/features/auth";
import { useBuyerOrders, useOrderErrorText } from "@/features/orders";
import { useMyReviews, type BuyerReviewServices } from "@/features/reviews";
import { useUi } from "@/shared/ui-state/ui-provider";

/** What the buyer does from "Pesanan saya": confirm receipt, send a proof later, and write reviews of what arrived. */
export function useOrderActions(reviewServices?: BuyerReviewServices) {
  const { user } = useAuth();
  const { showToast } = useUi();
  const { orders, sendProof, confirmReceived } = useBuyerOrders();
  const orderErrorText = useOrderErrorText();
  const reviews = useMyReviews(user?.id ?? null, reviewServices);
  const [localReviews, setLocalReviews] = useState(INITIAL_MY_REVIEWS);

  /** Sends a transfer proof for an order that has none yet. */
  const sendOrderProof = useCallback(
    async (order: Order, file: File) => {
      const result = await sendProof(order, file);
      showToast(result.ok ? t("store.toast.proofSent") : orderErrorText(result.error));
      return result.ok;
    },
    [orderErrorText, sendProof, showToast],
  );

  /** Buyer taps "Pesanan selesai" on a paid order. */
  const completeOrder = useCallback(
    async (orderNumber: string) => {
      const order = orders.find((o) => o.number === orderNumber);
      if (!order) return;
      const result = await confirmReceived(order);
      showToast(result.ok ? t("store.toast.orderCompleted") : orderErrorText(result.error));
    },
    [confirmReceived, orderErrorText, orders, showToast],
  );

  // The buyer's reviews as the order screens read them, by "order number:product". In the database they come from the
  // reviews table, matched to the order items they are about; otherwise from this browser.
  const myReviews = useMemo(() => {
    if (!reviews.database) return localReviews;
    const out: Record<string, MyReview> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const mine = item.itemId === undefined ? undefined : reviews.byItemId[item.itemId];
        if (mine) out[`${order.number}:${item.productId}`] = { rating: mine.rating, text: mine.body };
      }
    }
    return out;
  }, [localReviews, orders, reviews.byItemId, reviews.database]);

  /** Saves the review of one order item. Returns false (with a toast) when rating or text is missing. */
  const saveReview = useCallback(
    (orderNumber: string, productId: number, review: MyReview): boolean | Promise<boolean> => {
      if (review.rating < 1) {
        showToast(t("store.toast.reviewNeedRating"));
        return false;
      }
      if (!review.text) {
        showToast(t("store.toast.reviewNeedText"));
        return false;
      }
      const key = `${orderNumber}:${productId}`;
      const updating = Boolean(myReviews[key]);
      if (!reviews.database) {
        showToast(updating ? t("store.toast.reviewUpdated") : t("store.toast.reviewSent"));
        setLocalReviews((prev) => ({ ...prev, [key]: review }));
        return true;
      }
      const itemId = orders.find((o) => o.number === orderNumber)?.items.find((i) => i.productId === productId)?.itemId;
      if (itemId === undefined) {
        showToast(t("store.reviewErrors.itemNotFound"));
        return false;
      }
      return reviews.submit(itemId, review.rating, review.text).then((result) => {
        showToast(result.ok ? (updating ? t("store.toast.reviewUpdated") : t("store.toast.reviewSent")) : t(`store.reviewErrors.${result.error}`));
        return result.ok;
      });
    },
    [myReviews, orders, reviews, showToast],
  );

  return { sendOrderProof, completeOrder, myReviews, saveReview };
}
