// Run with `npm run test:ui`. The buyer's own reviews and the admin's review list as hooks, against fakes.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminReviews } from "./admin-reviews";
import type { AdminReview } from "./lib/admin-review-repository";
import type { Write } from "./lib/buyer-review-repository";
import type { AdminReviewServices, BuyerReviewServices } from "./lib/services";
import { useMyReviews } from "./my-reviews";

beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("useMyReviews", () => {
  const services = (over: Partial<BuyerReviewServices["repo"]> = {}) => {
    const repo = {
      listMyReviews: vi.fn(async (): Promise<Write<{ orderItemId: number; rating: number; body: string }[]>> => ({ ok: true, value: [{ orderItemId: 7, rating: 4, body: "Oke" }] })),
      submitReview: vi.fn(async (): Promise<Write<number>> => ({ ok: true, value: 1 })),
      ...over,
    };
    return { s: { repo } as BuyerReviewServices, repo };
  };

  it("is not the database, and reads nothing, when there are no credentials and no fake", () => {
    const view = renderHook(() => useMyReviews("u-1"));
    expect(view.result.current.database).toBe(false);
    expect(view.result.current.byItemId).toEqual({});
  });
  it("reads the signed-in buyer's reviews by order item", async () => {
    const { s, repo } = services();
    const view = renderHook(() => useMyReviews("u-1", s));
    await waitFor(() => expect(view.result.current.byItemId).toEqual({ 7: { rating: 4, body: "Oke" } }));
    expect(view.result.current.database).toBe(true);
    expect(repo.listMyReviews).toHaveBeenCalledWith("u-1");
  });
  it("reads nothing for a signed-out visitor, and forgets the reviews when they sign out", async () => {
    const { s, repo } = services();
    const view = renderHook(({ id }: { id: string | null }) => useMyReviews(id, s), { initialProps: { id: null as string | null } });
    await act(async () => {});
    expect(repo.listMyReviews).not.toHaveBeenCalled();
    view.rerender({ id: "u-1" });
    await waitFor(() => expect(Object.keys(view.result.current.byItemId)).toEqual(["7"]));
    view.rerender({ id: null });
    await waitFor(() => expect(view.result.current.byItemId).toEqual({}));
  });
  it("ignores a slow answer for a buyer who has since signed out or changed", async () => {
    let finish: (r: Write<{ orderItemId: number; rating: number; body: string }[]>) => void = () => {};
    const listMyReviews = vi.fn(() => new Promise<Write<{ orderItemId: number; rating: number; body: string }[]>>((resolve) => { finish = resolve; }));
    const view = renderHook(({ id }: { id: string | null }) => useMyReviews(id, services({ listMyReviews }).s), { initialProps: { id: "u-1" as string | null } });
    await waitFor(() => expect(listMyReviews).toHaveBeenCalledTimes(1));
    view.rerender({ id: null });
    await act(async () => finish({ ok: true, value: [{ orderItemId: 7, rating: 4, body: "Dari akun lama" }] }));
    expect(view.result.current.byItemId).toEqual({});
  });
  it("keeps what it had when a read fails", async () => {
    const listMyReviews = vi.fn<BuyerReviewServices["repo"]["listMyReviews"]>().mockResolvedValueOnce({ ok: true, value: [{ orderItemId: 7, rating: 4, body: "Oke" }] }).mockResolvedValueOnce({ ok: false, error: "network" });
    const view = renderHook(({ id }: { id: string }) => useMyReviews(id, services({ listMyReviews }).s), { initialProps: { id: "u-1" } });
    await waitFor(() => expect(Object.keys(view.result.current.byItemId)).toEqual(["7"]));
  });
  it("submits a trimmed review and shows it at once, replacing an older one for the same item", async () => {
    const { s, repo } = services();
    const view = renderHook(() => useMyReviews("u-1", s));
    await waitFor(() => expect(view.result.current.byItemId[7]).toBeDefined());
    let result: Write<number> | undefined;
    await act(async () => { result = await view.result.current.submit(7, 5, "  Mantap  "); });
    expect(result).toEqual({ ok: true, value: 1 });
    expect(repo.submitReview).toHaveBeenCalledWith(7, 5, "Mantap");
    expect(view.result.current.byItemId[7]).toEqual({ rating: 5, body: "Mantap" });
  });
  it("shows nothing new when the database refuses, and passes the reason on", async () => {
    const { s } = services({ submitReview: async () => ({ ok: false, error: "notReviewable" }) });
    const view = renderHook(() => useMyReviews("u-1", s));
    await waitFor(() => expect(view.result.current.byItemId[7]).toBeDefined());
    let result: Write<number> | undefined;
    await act(async () => { result = await view.result.current.submit(9, 5, "x"); });
    expect(result).toEqual({ ok: false, error: "notReviewable" });
    expect(view.result.current.byItemId[9]).toBeUndefined();
  });
});

describe("useAdminReviews", () => {
  const review = (id: number, hidden = false): AdminReview => ({ id, buyer: "Ana", product: "Mug", rating: 5, text: "x", verified: true, hidden, createdAt: "2026-10-13T00:00:00Z" });
  const services = (over: Partial<AdminReviewServices["repo"]> = {}) => {
    const repo = {
      listAll: vi.fn(async (): Promise<Write<AdminReview[]>> => ({ ok: true, value: [review(1), review(2, true)] })),
      setHidden: vi.fn(async (): Promise<Write<null>> => ({ ok: true, value: null })),
      ...over,
    };
    return { s: { repo } as AdminReviewServices, repo };
  };

  it("is not the database, with no reviews and ready, when there are no credentials and no fake", () => {
    const view = renderHook(() => useAdminReviews());
    expect(view.result.current).toMatchObject({ database: false, reviews: [], status: "ready" });
  });
  it("starts out loading, then lists every review", async () => {
    let finish: (r: Write<AdminReview[]>) => void = () => {};
    const { s } = services({ listAll: () => new Promise((resolve) => { finish = resolve; }) });
    const view = renderHook(() => useAdminReviews(s));
    expect(view.result.current.status).toBe("loading");
    await act(async () => finish({ ok: true, value: [review(1)] }));
    expect(view.result.current.status).toBe("ready");
    expect(view.result.current.reviews).toHaveLength(1);
  });
  it("reports a failed read and keeps the reviews it had", async () => {
    const listAll = vi.fn<AdminReviewServices["repo"]["listAll"]>().mockResolvedValueOnce({ ok: true, value: [review(1)] }).mockResolvedValueOnce({ ok: false, error: "network" });
    const view = renderHook(() => useAdminReviews(services({ listAll }).s));
    await waitFor(() => expect(view.result.current.reviews).toHaveLength(1));
    await act(async () => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.reviews).toHaveLength(1);
  });
  it("hides a review in the database and reads the list again", async () => {
    const { s, repo } = services();
    const view = renderHook(() => useAdminReviews(s));
    await waitFor(() => expect(repo.listAll).toHaveBeenCalledTimes(1));
    let result: Write<null> | undefined;
    await act(async () => { result = await view.result.current.setHidden(1, true); });
    expect(result).toEqual({ ok: true, value: null });
    expect(repo.setHidden).toHaveBeenCalledWith(1, true);
    await waitFor(() => expect(repo.listAll).toHaveBeenCalledTimes(2));
  });
  it("does not read again when the database refuses", async () => {
    const { s, repo } = services({ setHidden: async () => ({ ok: false, error: "forbidden" }) });
    const view = renderHook(() => useAdminReviews(s));
    await waitFor(() => expect(repo.listAll).toHaveBeenCalledTimes(1));
    let result: Write<null> | undefined;
    await act(async () => { result = await view.result.current.setHidden(1, true); });
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(repo.listAll).toHaveBeenCalledTimes(1);
  });
});
