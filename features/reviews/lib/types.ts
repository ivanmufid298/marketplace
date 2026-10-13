/** One published review, as the shop shows it. */
export type ProductReview = {
  id: number;
  /** The name that was shown with the review when it was written. */
  author: string;
  /** 1 to 5. */
  rating: number;
  body: string;
  /** True when the review comes from a completed order. */
  verified: boolean;
  /** ISO time the review was written. */
  createdAt: string;
};

/** The numbers above the list: how many reviews, the average, and how many of each star. */
export type ReviewStats = {
  count: number;
  /** 0 when there are no reviews. */
  average: number;
  /** `stars[0]` is the number of 1-star reviews, `stars[4]` the number of 5-star reviews. */
  stars: [number, number, number, number, number];
};

export type ProductReviews = { stats: ReviewStats; reviews: ProductReview[] };

export const NO_REVIEWS: ProductReviews = { stats: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] };

export type ReviewsError = "network" | "unknown";
export type ReviewsResult = { ok: true; value: ProductReviews } | { ok: false; error: ReviewsError };
