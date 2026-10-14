// Characterization tests for the storefront as a whole: the catalog, panels, and the buyer's orders and reviews as the
// modules offer them together (see storefront-test-support.tsx). Run with `npm run test:ui`. Where today's behavior looks
// odd it is still asserted, with a comment saying so.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { products } from "@/lib/mock/store";
import { resetOrders } from "@/lib/orders-store";
import { Storefront, useStorefront } from "./storefront-test-support";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [, , headphone] = products;

const wrapper = ({ children }: { children: ReactNode }) => <Storefront>{children}</Storefront>;

function mount() {
  const view = renderHook(() => useStorefront(), { wrapper });
  return { ...view, s: () => view.result.current, a: () => view.result.current.auth };
}

/** Mounts with Nadia already signed in (the demo adapter keeps its session in localStorage). */
function mountSignedIn() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  return mount();
}

const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });

beforeEach(() => {
  window.localStorage.clear();
  document.body.style.overflow = "";
  resetOrders();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("catalog: filter, search, sort, wishlist", () => {
  it("starts with every product, no filter, and nothing open", async () => {
    const m = mount();
    expect(m.s().products).toHaveLength(6);
    expect(m.s().visibleProducts.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.s().category).toBe("all");
    expect(m.s().cart).toEqual([]);
    expect(Object.values(m.s().panels).every((open) => !open)).toBe(true);
    expect(m.s().signedIn).toBe(false);
  });

  it("filters by category", async () => {
    const m = mount();
    await run(() => m.s().setCategory("Rumah"));
    expect(m.s().visibleProducts.map((p) => p.name)).toEqual(["Mug Blush Daily", "Lampu Meja Lumi"]);
  });

  it("searches name, shop, and category (the query is expected in lowercase)", async () => {
    const m = mount();
    await run(() => m.s().setQuery("mug"));
    expect(m.s().visibleProducts.map((p) => p.id)).toEqual([1]);
    await run(() => m.s().setQuery("rumah")); // category Rumah and the shop "Rumah Senja"
    expect(m.s().visibleProducts.map((p) => p.id)).toEqual([1, 4]);
    await run(() => m.s().setQuery("tidak ada"));
    expect(m.s().visibleProducts).toEqual([]);
  });

  it("sorts by price, low and high", async () => {
    const m = mount();
    await run(() => m.s().setSort("low"));
    expect(m.s().visibleProducts.map((p) => p.price)).toEqual([...m.s().visibleProducts.map((p) => p.price)].sort((x, y) => x - y));
    await run(() => m.s().setSort("high"));
    expect(m.s().visibleProducts[0].id).toBe(3);
    expect(m.s().visibleProducts.at(-1)?.id).toBe(1);
  });

  it("toggles the wishlist with a toast each way", async () => {
    const m = mount();
    await run(() => m.s().toggleLike(2));
    expect([...m.s().liked]).toEqual([2]);
    expect(m.s().toast).toBe("Disimpan ke wishlist");
    await run(() => m.s().toggleLike(2));
    expect([...m.s().liked]).toEqual([]);
    expect(m.s().toast).toBe("Dihapus dari wishlist");
  });

  it("showing saved items lists only the wishlist, showing all resets every filter", async () => {
    const m = mount();
    await run(() => m.s().showSaved());
    expect(m.s().savedOnly).toBe(true);
    expect(m.s().toast).toBe("Wishlist kamu masih kosong");
    expect(m.s().visibleProducts).toEqual([]);
    await run(() => m.s().toggleLike(4));
    expect(m.s().visibleProducts.map((p) => p.id)).toEqual([4]);
    await run(() => {
      m.s().setQuery("zzz");
      m.s().showAll();
    });
    expect(m.s().savedOnly).toBe(false);
    expect(m.s().query).toBe("");
    expect(m.s().visibleProducts).toHaveLength(6);
  });

  it("choosing a category leaves the wishlist view", async () => {
    const m = mount();
    await run(() => m.s().showSaved());
    await run(() => m.s().setCategory("Fashion"));
    expect(m.s().savedOnly).toBe(false);
  });

  it("opens a product's detail panel", async () => {
    const m = mount();
    await run(() => m.s().openDetail(headphone));
    expect(m.s().selected?.id).toBe(3);
    expect(m.s().panels.detail).toBe(true);
  });
});

describe("panels, toast, and global key handling", () => {
  it("opens, closes, and toggles panels", async () => {
    const m = mount();
    await run(() => m.s().openPanel("chat"));
    expect(m.s().panels.chat).toBe(true);
    await run(() => m.s().togglePanel("chat"));
    expect(m.s().panels.chat).toBe(false);
    await run(() => m.s().openPanel("orders"));
    await run(() => m.s().closePanel("orders"));
    expect(m.s().panels.orders).toBe(false);
  });

  it("Escape closes every panel", async () => {
    const m = mount();
    await run(() => {
      m.s().openPanel("drawer");
      m.s().openPanel("chat");
    });
    await run(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(Object.values(m.s().panels).every((open) => !open)).toBe(true);
  });

  it("locks page scroll while a drawer-like panel is open, but not for chat", async () => {
    const m = mount();
    await run(() => m.s().openPanel("chat"));
    expect(document.body.style.overflow).toBe("");
    await run(() => m.s().openPanel("drawer"));
    expect(document.body.style.overflow).toBe("hidden");
    await run(() => m.s().closePanel("drawer"));
    expect(document.body.style.overflow).toBe("");
  });

  it("clears the toast after 1.8 seconds", async () => {
    vi.useFakeTimers();
    const m = mount();
    await run(() => m.s().showToast("Halo"));
    expect(m.s().toast).toBe("Halo");
    await act(async () => { vi.advanceTimersByTime(1799); });
    expect(m.s().toast).toBe("Halo");
    await act(async () => { vi.advanceTimersByTime(2); });
    expect(m.s().toast).toBe("");
  });
});

describe("orders and reviews", () => {
  it("shows only the signed in buyer's orders, and none to a guest", async () => {
    expect(mount().s().orders).toEqual([]);
    cleanup();
    const m = mountSignedIn();
    expect(m.s().orders.map((o) => o.number).sort()).toEqual(["837240", "837270", "837288", "837301", "837312"]);
  });

  it("marks a paid order as received", async () => {
    const m = mountSignedIn();
    await run(() => m.s().completeOrder("837288"));
    expect(m.s().orders.find((o) => o.number === "837288")?.received).toBe(true);
    expect(m.s().toast).toBe("Terima kasih, pesanan ditandai selesai");
  });

  it("does not complete an unpaid order", async () => {
    const m = mountSignedIn();
    await run(() => m.s().completeOrder("837312"));
    expect(m.s().orders.find((o) => o.number === "837312")?.received).toBe(false);
    // Changed on purpose: the buyer is now told why nothing happened (the button is only shown for a paid order, but
    // the database may have cancelled it meanwhile).
    expect(m.s().toast).toBe("Pesanan ini belum bisa ditandai selesai: pembayarannya belum diterima, atau sudah selesai atau dibatalkan.");
  });

  it("starts with the seeded review", async () => {
    expect(mount().s().myReviews["837240:6"]).toMatchObject({ rating: 5 });
  });

  it("validates a review, saves it, and reports an update the second time", async () => {
    const m = mountSignedIn();
    let ok = true;
    await run(async () => { ok = await m.s().saveReview("837288", 4, { rating: 0, text: "bagus" }); });
    expect(ok).toBe(false);
    expect(m.s().toast).toBe("Pilih rating dulu");

    await run(async () => { ok = await m.s().saveReview("837288", 4, { rating: 5, text: "" }); });
    expect(ok).toBe(false);
    expect(m.s().toast).toBe("Tulis ulasanmu dulu");
    expect(m.s().myReviews["837288:4"]).toBeUndefined();

    await run(async () => { ok = await m.s().saveReview("837288", 4, { rating: 5, text: "Lampunya bagus" }); });
    expect(ok).toBe(true);
    expect(m.s().toast).toBe("Terima kasih, ulasanmu terkirim");
    expect(m.s().myReviews["837288:4"]).toEqual({ rating: 5, text: "Lampunya bagus" });

    await run(() => { m.s().saveReview("837288", 4, { rating: 4, text: "Cukup bagus" }); });
    expect(m.s().toast).toBe("Ulasanmu diperbarui");
    expect(m.s().myReviews["837288:4"]).toEqual({ rating: 4, text: "Cukup bagus" });
  });
});
