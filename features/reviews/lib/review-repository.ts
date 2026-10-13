import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_REVIEWS, type ProductReview, type ReviewsResult, type ReviewStats } from "./types";

// Reads the reviews of one product: the summary numbers and the newest reviews. Both ask for published reviews by name,
// so an admin who is signed in sees what shoppers see (the database would also hand an admin the hidden ones).

/** Only `from` is used, so a fake can stand in for the client in tests. */
export type ReviewsDb = Pick<SupabaseClient, "from">;

/** How many reviews one product page lists. The summary always counts all of them. */
export const REVIEWS_PER_PAGE = 20;

type StatsRow = { review_count: number; average_rating: number | string; star_1: number; star_2: number; star_3: number; star_4: number; star_5: number };
type ReviewRow = { id: number; author_name: string; rating: number; body: string; is_verified: boolean; created_at: string };

const STATS_COLUMNS = "review_count, average_rating, star_1, star_2, star_3, star_4, star_5";
const REVIEW_COLUMNS = "id, author_name, rating, body, is_verified, created_at";

export function toStats(row: StatsRow | null): ReviewStats {
  if (!row) return NO_REVIEWS.stats;
  return { count: row.review_count, average: Number(row.average_rating), stars: [row.star_1, row.star_2, row.star_3, row.star_4, row.star_5] };
}

export const toReview = (row: ReviewRow): ProductReview => ({ id: row.id, author: row.author_name, rating: row.rating, body: row.body, verified: row.is_verified, createdAt: row.created_at });

export function createReviewRepository(db: ReviewsDb) {
  return {
    async getProductReviews(productId: number): Promise<ReviewsResult> {
      const statsQuery = await db.from("product_review_stats").select(STATS_COLUMNS).eq("product_id", productId).maybeSingle();
      const listQuery = await db
        .from("product_reviews")
        .select(REVIEW_COLUMNS)
        .eq("product_id", productId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(REVIEWS_PER_PAGE);

      const failure = statsQuery.error ?? listQuery.error;
      if (failure) return { ok: false, error: !failure.code && /failed to fetch|network|load failed|fetch failed/i.test(failure.message ?? "") ? "network" : "unknown" };
      return { ok: true, value: { stats: toStats(statsQuery.data as StatsRow | null), reviews: ((listQuery.data ?? []) as ReviewRow[]).map(toReview) } };
    },
  };
}

export type ReviewRepository = ReturnType<typeof createReviewRepository>;
