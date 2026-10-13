import type { ReviewStats } from "./types";

/** The shape the rating summary component draws: the score as text and one bar per star, 5 stars first. */
export type RatingSummaryData = { score: string; count: number; bars: { star: string; pct: number }[] };

/** "3,8" for an average of 3.8, the way people in Indonesia write it. */
export const formatScore = (average: number) => average.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function toRatingSummary(stats: ReviewStats): RatingSummaryData {
  return {
    score: formatScore(stats.average),
    count: stats.count,
    bars: [5, 4, 3, 2, 1].map((star) => ({ star: String(star), pct: stats.count > 0 ? Math.round((stats.stars[star - 1] / stats.count) * 100) : 0 })),
  };
}

/** schema.org rating for a product's search result. Only for a product that has reviews; an empty one must not claim a rating. */
export function aggregateRatingJsonLd(stats: ReviewStats) {
  if (stats.count < 1) return null;
  return { "@type": "AggregateRating", ratingValue: Number(stats.average.toFixed(1)), reviewCount: stats.count, bestRating: 5, worstRating: 1 };
}
