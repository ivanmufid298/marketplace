// Run with `npm run test:ui`. The numbers above the review list, and the rating reported to search engines.
import { describe, expect, it } from "vitest";
import { aggregateRatingJsonLd, formatScore, toRatingSummary } from "./summary";
import { NO_REVIEWS } from "./types";

describe("formatScore", () => {
  it("writes one decimal with a comma", () => {
    expect(formatScore(3.8)).toBe("3,8");
    expect(formatScore(5)).toBe("5,0");
    expect(formatScore(4.25)).toBe("4,3");
  });
});

describe("toRatingSummary", () => {
  it("lists the bars from 5 stars down, as whole percentages of all reviews", () => {
    const summary = toRatingSummary({ count: 5, average: 3.8, stars: [0, 1, 1, 1, 2] });
    expect(summary).toEqual({
      score: "3,8",
      count: 5,
      bars: [{ star: "5", pct: 40 }, { star: "4", pct: 20 }, { star: "3", pct: 20 }, { star: "2", pct: 20 }, { star: "1", pct: 0 }],
    });
  });
  it("rounds each bar", () => {
    expect(toRatingSummary({ count: 3, average: 4, stars: [0, 0, 0, 1, 2] }).bars.map((b) => b.pct)).toEqual([67, 33, 0, 0, 0]);
  });
  it("is all zero for no reviews instead of dividing by zero", () => {
    expect(toRatingSummary(NO_REVIEWS.stats).bars.map((b) => b.pct)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("aggregateRatingJsonLd", () => {
  it("describes the rating of a product with reviews", () => {
    expect(aggregateRatingJsonLd({ count: 5, average: 3.8, stars: [0, 1, 1, 1, 2] })).toEqual({ "@type": "AggregateRating", ratingValue: 3.8, reviewCount: 5, bestRating: 5, worstRating: 1 });
  });
  it("keeps one decimal", () => {
    expect(aggregateRatingJsonLd({ count: 3, average: 4.333333, stars: [0, 0, 0, 2, 1] })?.ratingValue).toBe(4.3);
  });
  it("claims nothing for a product with no reviews", () => {
    expect(aggregateRatingJsonLd(NO_REVIEWS.stats)).toBeNull();
  });
  it("counts a single review", () => {
    expect(aggregateRatingJsonLd({ count: 1, average: 5, stars: [0, 0, 0, 0, 1] })?.reviewCount).toBe(1);
  });
});
