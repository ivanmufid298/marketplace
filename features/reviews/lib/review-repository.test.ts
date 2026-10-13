// Run with `npm run test:ui`. What the shop asks the database for and how rows become reviews. Who may see which
// review is enforced by Row Level Security and covered by the SQL tests; this checks the query also asks for published
// reviews by name, so a signed-in admin sees what shoppers see.
import { describe, expect, it } from "vitest";
import { createReviewRepository, REVIEWS_PER_PAGE, toReview, toStats, type ReviewsDb } from "./review-repository";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Call = { table: string; ops: [string, unknown[]][] };

function fakeDb(answers: Answer[]) {
  const calls: Call[] = [];
  let next = 0;
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => { const a = answers[next++] ?? {}; return Promise.resolve({ data: a.data ?? null, error: a.error ?? null }).then(resolve); };
        return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
      },
    });
    return chain;
  };
  return { db: { from } as unknown as ReviewsDb, calls };
}
const opsOf = (call: Call, name: string) => call.ops.filter(([op]) => op === name).map(([, args]) => args);

const statsRow = { review_count: 5, average_rating: "3.80", star_1: 0, star_2: 1, star_3: 1, star_4: 1, star_5: 2 };
const reviewRow = (id: number, over: Record<string, unknown> = {}) => ({ id, author_name: "Nadia P.", rating: 5, body: "Cantik", is_verified: true, created_at: "2026-10-01T00:00:00Z", ...over });

describe("toStats and toReview", () => {
  it("maps the summary row, reading the average as a number", () => {
    expect(toStats(statsRow)).toEqual({ count: 5, average: 3.8, stars: [0, 1, 1, 1, 2] });
    expect(toStats({ ...statsRow, average_rating: 4 }).average).toBe(4);
  });
  it("is empty when there is no summary row", () => {
    expect(toStats(null)).toEqual({ count: 0, average: 0, stars: [0, 0, 0, 0, 0] });
  });
  it("maps a review row", () => {
    expect(toReview(reviewRow(3))).toEqual({ id: 3, author: "Nadia P.", rating: 5, body: "Cantik", verified: true, createdAt: "2026-10-01T00:00:00Z" });
  });
});

describe("getProductReviews", () => {
  it("reads the summary and the newest published reviews of the product", async () => {
    const { db, calls } = fakeDb([{ data: statsRow }, { data: [reviewRow(2), reviewRow(1, { author_name: "Sarah A." })] }]);
    const result = await createReviewRepository(db).getProductReviews(7);
    expect(result).toEqual({
      ok: true,
      value: {
        stats: { count: 5, average: 3.8, stars: [0, 1, 1, 1, 2] },
        reviews: [
          { id: 2, author: "Nadia P.", rating: 5, body: "Cantik", verified: true, createdAt: "2026-10-01T00:00:00Z" },
          { id: 1, author: "Sarah A.", rating: 5, body: "Cantik", verified: true, createdAt: "2026-10-01T00:00:00Z" },
        ],
      },
    });
    expect(calls[0].table).toBe("product_review_stats");
    expect(opsOf(calls[0], "eq")).toEqual([["product_id", 7]]);
    expect(calls[1].table).toBe("product_reviews");
    expect(opsOf(calls[1], "eq")).toEqual([["product_id", 7], ["status", "published"]]);
    expect(opsOf(calls[1], "order")).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(opsOf(calls[1], "limit")).toEqual([[REVIEWS_PER_PAGE]]);
  });
  it("returns no reviews for a product that has none", async () => {
    const result = await createReviewRepository(fakeDb([{ data: null }, { data: [] }]).db).getProductReviews(7);
    expect(result).toEqual({ ok: true, value: { stats: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] } });
    const nothing = await createReviewRepository(fakeDb([{}, {}]).db).getProductReviews(7);
    expect(nothing.ok && nothing.value.reviews).toEqual([]);
  });
  it("reports a network failure and any other failure, from either query", async () => {
    expect(await createReviewRepository(fakeDb([{ error: { message: "Failed to fetch" } }, {}]).db).getProductReviews(7)).toEqual({ ok: false, error: "network" });
    expect(await createReviewRepository(fakeDb([{}, { error: { message: "TypeError: fetch failed" } }]).db).getProductReviews(7)).toEqual({ ok: false, error: "network" });
    expect(await createReviewRepository(fakeDb([{ error: { code: "42501", message: "permission denied" } }, {}]).db).getProductReviews(7)).toEqual({ ok: false, error: "unknown" });
    expect(await createReviewRepository(fakeDb([{}, { error: { code: "XX000", message: "Failed to fetch" } }]).db).getProductReviews(7)).toEqual({ ok: false, error: "unknown" });
  });
});
