import type { SupabaseClient } from "@supabase/supabase-js";
import { mapReviewWriteError } from "./write-errors";
import type { ReviewsError } from "./types";

// What a buyer does with their own reviews: write one for an item of a completed order, and read what they wrote. The
// database decides whether the item may be reviewed (submit_review); this code only carries the request.

export type BuyerReviewsDb = Pick<SupabaseClient, "from" | "rpc">;
export type Write<T> = { ok: true; value: T } | { ok: false; error: ReviewsError };

export type MyReviewRow = { orderItemId: number; rating: number; body: string };

export function createBuyerReviewRepository(db: BuyerReviewsDb) {
  return {
    /** Writes the review of one bought item, or edits it when it was already written. Returns the review's id. */
    async submitReview(orderItemId: number, rating: number, body: string): Promise<Write<number>> {
      const { data, error } = await db.rpc("submit_review", { p_order_item_id: orderItemId, p_rating: rating, p_body: body });
      if (error) return { ok: false, error: mapReviewWriteError(error) };
      return typeof data === "number" ? { ok: true, value: data } : { ok: false, error: "unknown" };
    },

    /** The reviews the signed-in buyer wrote (the database shows them only their own, hidden ones too). */
    async listMyReviews(userId: string): Promise<Write<MyReviewRow[]>> {
      const { data, error } = await db.from("product_reviews").select("order_item_id, rating, body").eq("user_id", userId).not("order_item_id", "is", null);
      if (error) return { ok: false, error: mapReviewWriteError(error) };
      return { ok: true, value: ((data ?? []) as { order_item_id: number; rating: number; body: string }[]).map((r) => ({ orderItemId: r.order_item_id, rating: r.rating, body: r.body })) };
    },
  };
}

export type BuyerReviewRepository = ReturnType<typeof createBuyerReviewRepository>;
