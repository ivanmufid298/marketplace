// Run with `npm run test:ui`. Reading reviews from the server: a missing setting or a failed read looks like "no reviews".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewsDb } from "./review-repository";

const created: { url: string; key: string; options: unknown }[] = [];
let answers: { data: unknown; error: { message: string } | null }[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: unknown) => { created.push({ url, key, options }); return fake(); },
}));
function fake(): ReviewsDb {
  let next = 0;
  return {
    from: () => {
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(answers[next++] ?? { data: null, error: null }).then(resolve);
          return () => chain;
        },
      });
      return chain;
    },
  } as unknown as ReviewsDb;
}

const { getProductReviews } = await import("./reviews-server");
const empty = { stats: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] };
const stats = { review_count: 2, average_rating: 4.5, star_1: 0, star_2: 0, star_3: 0, star_4: 1, star_5: 1 };
const review = { id: 1, author_name: "Nadia P.", rating: 5, body: "Cantik", is_verified: true, created_at: "2026-10-01T00:00:00Z" };

beforeEach(() => {
  created.length = 0;
  answers = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("getProductReviews", () => {
  it("reads with the public key and no stored session", async () => {
    answers = [{ data: stats, error: null }, { data: [review], error: null }];
    const result = await getProductReviews(1);
    expect(result.stats).toEqual({ count: 2, average: 4.5, stars: [0, 0, 0, 1, 1] });
    expect(result.reviews).toHaveLength(1);
    expect(created[0]).toMatchObject({ url: "https://x.supabase.co", key: "anon-key", options: { auth: { persistSession: false, autoRefreshToken: false } } });
  });
  it("uses the client it is given instead of making one", async () => {
    answers = [{ data: stats, error: null }, { data: [], error: null }];
    expect((await getProductReviews(1, fake())).stats.count).toBe(2);
    expect(created).toHaveLength(0);
  });
  it("returns no reviews when the read fails", async () => {
    answers = [{ data: null, error: { message: "Failed to fetch" } }];
    expect(await getProductReviews(1)).toEqual(empty);
  });
  it("returns no reviews when the shop has no database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await getProductReviews(1)).toEqual(empty);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " ");
    expect(await getProductReviews(1)).toEqual(empty);
    expect(created).toHaveLength(0);
  });
});
