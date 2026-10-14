"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserBuyerReviewServices, reviewsInDatabase, type BuyerReviewServices } from "./lib/services";
import type { MyReviewRow, Write } from "./lib/buyer-review-repository";

// The signed-in buyer's own reviews, by the order item they are about. In the database when the build has Supabase
// credentials (or a fake is given); otherwise `database` is false and the shop keeps the reviews in its own state.

export type MyReviews = {
  database: boolean;
  /** The buyer's reviews, by the id of the order item. */
  byItemId: Record<number, { rating: number; body: string }>;
  submit: (orderItemId: number, rating: number, body: string) => Promise<Write<number>>;
};

export function useMyReviews(userId: string | null, provided?: BuyerReviewServices): MyReviews {
  const database = provided !== undefined || reviewsInDatabase();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<BuyerReviewServices | null>(provided ?? null);
  const [byItemId, setByItemId] = useState<MyReviews["byItemId"]>({});

  useEffect(() => {
    if (database && !services) setServices(createBrowserBuyerReviewServices());
  }, [database, services]);

  useEffect(() => {
    if (!services || !userId) {
      setByItemId({});
      return;
    }
    let current = true;
    void services.repo.listMyReviews(userId).then((result) => {
      if (!current || !result.ok) return;
      setByItemId(Object.fromEntries(result.value.map((r: MyReviewRow) => [r.orderItemId, { rating: r.rating, body: r.body }])));
    });
    return () => {
      current = false;
    };
  }, [services, userId]);

  const submit = useCallback(
    async (orderItemId: number, rating: number, body: string): Promise<Write<number>> => {
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.submitReview(orderItemId, rating, body.trim());
      if (result.ok) setByItemId((prev) => ({ ...prev, [orderItemId]: { rating, body: body.trim() } }));
      return result;
    },
    [services],
  );

  return { database, byItemId, submit };
}
