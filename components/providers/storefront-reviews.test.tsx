// Run with `npm run test:ui`. The buyer's reviews against a database-backed reviews module (a fake): they are matched to
// the order items they are about, written through the database, and explained when refused.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderServices } from "@/features/orders";
import type { BuyerReviewServices } from "@/features/reviews";
import type { Order } from "@/lib/mock/orders";
import { Storefront, useStorefront } from "./storefront-test-support";

const SESSION_KEY = "marketplace-demo-session-v1";
const completed: Order = {
  id: "o-9", number: "100009", buyerId: "nadia", buyer: "N", phone: "1", address: "x", date: "d", shippingMethod: "Reguler", shippingFee: 0, payment: "success", received: true, history: [],
  items: [{ itemId: 71, productId: 5, qty: 1, price: 100, name: "Tas", photos: [] }, { itemId: 72, productId: 6, qty: 1, price: 50, name: "Mug", photos: [] }],
};

function setup(reviewOver: Partial<BuyerReviewServices["repo"]> = {}, orders: Order[] = [completed]) {
  const orderRepo = {
    listShippingMethods: vi.fn(async () => ({ ok: true as const, value: [] })),
    listMyOrders: vi.fn(async () => ({ ok: true as const, value: orders })),
    placeOrder: vi.fn(), sendProof: vi.fn(), confirmReceived: vi.fn(),
  };
  const reviewRepo = {
    listMyReviews: vi.fn(async () => ({ ok: true as const, value: [{ orderItemId: 71, rating: 4, body: "Oke" }] })),
    submitReview: vi.fn(async () => ({ ok: true as const, value: 1 })),
    ...reviewOver,
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Storefront orderServices={{ repo: orderRepo } as unknown as OrderServices}>{children}</Storefront>
  );
  const view = renderHook(() => useStorefront({ repo: reviewRepo } as BuyerReviewServices), { wrapper });
  return { s: () => view.result.current, reviewRepo };
}
async function save(m: ReturnType<typeof setup>, order: string, productId: number, rating: number, text: string) {
  let result: boolean | Promise<boolean> = false;
  await act(async () => { result = await m.s().saveReview(order, productId, { rating, text }); });
  return result;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});
afterEach(cleanup);

describe("what the buyer already wrote", () => {
  it("is matched to the order item it is about, keyed by order number and product", async () => {
    const m = setup();
    await waitFor(() => expect(m.s().myReviews).toEqual({ "100009:5": { rating: 4, text: "Oke" } }));
  });
  it("never shows the sample review, since reviews now come from the database", async () => {
    const m = setup();
    await waitFor(() => expect(Object.keys(m.s().myReviews)).toEqual(["100009:5"]));
    expect(m.s().myReviews["837240:6"]).toBeUndefined();
  });
  it("shows nothing for an order item whose review is not found", async () => {
    const m = setup({ listMyReviews: async () => ({ ok: true, value: [] }) });
    await act(async () => {});
    expect(m.s().myReviews).toEqual({});
  });
});

describe("writing a review", () => {
  it("sends the order item's id, the rating, and the text, then thanks the buyer", async () => {
    const m = setup();
    await waitFor(() => expect(m.s().orders).toHaveLength(1));
    expect(await save(m, "100009", 6, 5, "Mantap")).toBe(true);
    expect(m.reviewRepo.submitReview).toHaveBeenCalledWith(72, 5, "Mantap");
    expect(m.s().toast).toBe("Terima kasih, ulasanmu terkirim");
    expect(m.s().myReviews["100009:6"]).toEqual({ rating: 5, text: "Mantap" });
  });
  it("says updated when the buyer edits one they already wrote", async () => {
    const m = setup();
    await waitFor(() => expect(m.s().myReviews["100009:5"]).toBeDefined());
    expect(await save(m, "100009", 5, 2, "Ternyata biasa saja")).toBe(true);
    expect(m.reviewRepo.submitReview).toHaveBeenCalledWith(71, 2, "Ternyata biasa saja");
    expect(m.s().toast).toBe("Ulasanmu diperbarui");
    expect(m.s().myReviews["100009:5"]).toEqual({ rating: 2, text: "Ternyata biasa saja" });
  });
  it("needs a rating and a text before asking the database", async () => {
    const m = setup();
    await waitFor(() => expect(m.s().orders).toHaveLength(1));
    expect(await save(m, "100009", 6, 0, "bagus")).toBe(false);
    expect(m.s().toast).toBe("Pilih rating dulu");
    expect(await save(m, "100009", 6, 5, "")).toBe(false);
    expect(m.s().toast).toBe("Tulis ulasanmu dulu");
    expect(m.reviewRepo.submitReview).not.toHaveBeenCalled();
  });
  it("explains a refusal in words and keeps the form open (false)", async () => {
    const m = setup({ submitReview: async () => ({ ok: false, error: "notReviewable" }) });
    await waitFor(() => expect(m.s().orders).toHaveLength(1));
    expect(await save(m, "100009", 6, 5, "x")).toBe(false);
    expect(m.s().toast).toBe("Ulasan hanya bisa ditulis setelah pesanan ditandai selesai.");
    expect(m.s().myReviews["100009:6"]).toBeUndefined();
  });
  it("explains a lost connection", async () => {
    const m = setup({ submitReview: async () => ({ ok: false, error: "network" }) });
    await waitFor(() => expect(m.s().orders).toHaveLength(1));
    expect(await save(m, "100009", 6, 5, "x")).toBe(false);
    expect(m.s().toast).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
  });
  it("refuses an item that is not in the buyer's orders, without asking the database", async () => {
    const m = setup();
    await waitFor(() => expect(m.s().orders).toHaveLength(1));
    expect(await save(m, "100009", 99, 5, "x")).toBe(false);
    expect(await save(m, "000000", 5, 5, "x")).toBe(false);
    expect(m.s().toast).toBe("Barang ini tidak ditemukan di pesananmu.");
    expect(m.reviewRepo.submitReview).not.toHaveBeenCalled();
  });
});
