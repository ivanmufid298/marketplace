// Run with `npm run test:ui`. What the buyer's and the admin's review screens send to the database, and what they make of
// the answers. Who may do what is decided by the database and covered by the SQL tests.
import { describe, expect, it } from "vitest";
import { createAdminReviewRepository, toAdminReview, type AdminReviewsDb } from "./admin-review-repository";
import { createBuyerReviewRepository, type BuyerReviewsDb } from "./buyer-review-repository";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };

function fake(answer: Answer) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const queries: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }); },
    from: (table: string) => {
      const query = { table, ops: [] as [string, unknown[]][] };
      queries.push(query);
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
          return (...args: unknown[]) => { query.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  };
  return { db: db as unknown as BuyerReviewsDb & AdminReviewsDb, rpcCalls, queries };
}
const opsOf = (q: { ops: [string, unknown[]][] }, name: string) => q.ops.filter(([o]) => o === name).map(([, a]) => a);

describe("submitReview", () => {
  it("sends the item, rating, and text to the review function and returns the review's id", async () => {
    const { db, rpcCalls } = fake({ data: 42 });
    expect(await createBuyerReviewRepository(db).submitReview(7, 5, "Bagus")).toEqual({ ok: true, value: 42 });
    expect(rpcCalls).toEqual([{ name: "submit_review", args: { p_order_item_id: 7, p_rating: 5, p_body: "Bagus" } }]);
  });
  it("reports why the database refused", async () => {
    const { db } = fake({ error: { code: "P0001", message: "not_reviewable" } });
    expect(await createBuyerReviewRepository(db).submitReview(7, 5, "x")).toEqual({ ok: false, error: "notReviewable" });
  });
  it("reports a lost connection", async () => {
    expect(await createBuyerReviewRepository(fake({ error: { message: "Failed to fetch" } }).db).submitReview(7, 5, "x")).toEqual({ ok: false, error: "network" });
  });
  it("treats an answer with no review id as unknown", async () => {
    expect(await createBuyerReviewRepository(fake({ data: null }).db).submitReview(7, 5, "x")).toEqual({ ok: false, error: "unknown" });
    expect(await createBuyerReviewRepository(fake({ data: "42" }).db).submitReview(7, 5, "x")).toEqual({ ok: false, error: "unknown" });
  });
});

describe("listMyReviews", () => {
  it("reads the buyer's own reviews that are about a bought item", async () => {
    const { db, queries } = fake({ data: [{ order_item_id: 7, rating: 4, body: "Oke" }, { order_item_id: 9, rating: 5, body: "Mantap" }] });
    expect(await createBuyerReviewRepository(db).listMyReviews("u-1")).toEqual({ ok: true, value: [{ orderItemId: 7, rating: 4, body: "Oke" }, { orderItemId: 9, rating: 5, body: "Mantap" }] });
    expect(queries[0].table).toBe("product_reviews");
    expect(opsOf(queries[0], "eq")).toEqual([["user_id", "u-1"]]);
    expect(opsOf(queries[0], "not")).toEqual([["order_item_id", "is", null]]);
  });
  it("is empty for none and reports a failed read", async () => {
    expect(await createBuyerReviewRepository(fake({ data: null }).db).listMyReviews("u")).toEqual({ ok: true, value: [] });
    expect(await createBuyerReviewRepository(fake({ error: { message: "Failed to fetch" } }).db).listMyReviews("u")).toEqual({ ok: false, error: "network" });
  });
});

describe("toAdminReview", () => {
  const row = { id: 3, author_name: "Ana Putri", rating: 4, body: "Bagus", is_verified: true, status: "published" as const, created_at: "2026-10-13T11:00:00Z", products: { name: "Mug" } };
  it("maps a row, with the product's name", () => {
    expect(toAdminReview(row)).toEqual({ id: 3, buyer: "Ana Putri", product: "Mug", rating: 4, text: "Bagus", verified: true, hidden: false, createdAt: "2026-10-13T11:00:00Z" });
  });
  it("marks a hidden review, and copes with the product as an array, missing, or null", () => {
    expect(toAdminReview({ ...row, status: "hidden" }).hidden).toBe(true);
    expect(toAdminReview({ ...row, products: [{ name: "Tote" }] }).product).toBe("Tote");
    expect(toAdminReview({ ...row, products: null }).product).toBe("");
    expect(toAdminReview({ ...row, products: undefined }).product).toBe("");
  });
});

describe("the admin's list", () => {
  it("reads every review, newest first, with the product's name", async () => {
    const { db, queries } = fake({ data: [{ id: 3, author_name: "A", rating: 5, body: "x", is_verified: false, status: "hidden", created_at: "2026-10-13T11:00:00Z", products: { name: "Mug" } }] });
    const result = await createAdminReviewRepository(db).listAll();
    expect(result.ok && result.value[0]).toMatchObject({ id: 3, hidden: true, verified: false, product: "Mug" });
    expect(String(opsOf(queries[0], "select")[0][0])).toContain("products(name)");
    expect(opsOf(queries[0], "order")).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
  });
  it("is empty for none and reports a failed read", async () => {
    expect(await createAdminReviewRepository(fake({ data: null }).db).listAll()).toEqual({ ok: true, value: [] });
    expect(await createAdminReviewRepository(fake({ error: { message: "Failed to fetch" } }).db).listAll()).toEqual({ ok: false, error: "network" });
  });
});

describe("deleting", () => {
  it("deletes the review with that id and says it is done", async () => {
    const q = fake({ data: [{ id: 3 }] });
    expect(await createAdminReviewRepository(q.db).remove(3)).toEqual({ ok: true, value: null });
    expect(opsOf(q.queries[0], "delete")).toHaveLength(1);
    expect(opsOf(q.queries[0], "eq")).toEqual([["id", 3]]);
    expect(opsOf(q.queries[0], "update")).toEqual([]);
  });
  it("says it was refused when nothing was deleted, since security rules hide rows without an error", async () => {
    expect(await createAdminReviewRepository(fake({ data: [] }).db).remove(3)).toEqual({ ok: false, error: "forbidden" });
    expect(await createAdminReviewRepository(fake({ data: null }).db).remove(3)).toEqual({ ok: false, error: "forbidden" });
  });
  it("reports a database error and a lost connection", async () => {
    expect(await createAdminReviewRepository(fake({ error: { code: "42501", message: "permission denied" } }).db).remove(3)).toEqual({ ok: false, error: "forbidden" });
    expect(await createAdminReviewRepository(fake({ error: { message: "Failed to fetch" } }).db).remove(3)).toEqual({ ok: false, error: "network" });
  });
});

describe("hiding and showing", () => {
  it("hides a review by setting its status to hidden, and shows it by setting it to published", async () => {
    const hide = fake({ data: [{ id: 3 }] });
    expect(await createAdminReviewRepository(hide.db).setHidden(3, true)).toEqual({ ok: true, value: null });
    expect(opsOf(hide.queries[0], "update")).toEqual([[{ status: "hidden" }]]);
    expect(opsOf(hide.queries[0], "eq")).toEqual([["id", 3]]);
    const show = fake({ data: [{ id: 3 }] });
    await createAdminReviewRepository(show.db).setHidden(3, false);
    expect(opsOf(show.queries[0], "update")).toEqual([[{ status: "published" }]]);
  });
  it("says it was refused when nothing was changed, since security rules hide rows without an error", async () => {
    expect(await createAdminReviewRepository(fake({ data: [] }).db).setHidden(3, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await createAdminReviewRepository(fake({ data: null }).db).setHidden(3, true)).toEqual({ ok: false, error: "forbidden" });
  });
  it("reports a database error", async () => {
    expect(await createAdminReviewRepository(fake({ error: { code: "42501", message: "permission denied" } }).db).setHidden(3, true)).toEqual({ ok: false, error: "forbidden" });
  });
});
