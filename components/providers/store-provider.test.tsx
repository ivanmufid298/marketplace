// Characterization tests for the storefront state. They pin down what StoreProvider does today so that splitting it
// into per-feature modules can be shown not to change behavior. Run with `npm run test:ui`.
//
// The tests only use the public hooks (useStore, useAuth) and the demo sign in, so they keep working while the state
// moves between modules. Where today's behavior looks odd it is still asserted, with a comment saying so.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import { products } from "@/lib/mock/store";
import { OrdersProvider } from "@/features/orders";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { resetOrders } from "@/lib/orders-store";
import { StoreProvider, useStore } from "./store-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [mug, tote, headphone] = products; // stock 2, 1, 8

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>
    <UiProvider>
      <CatalogProvider>
        <OrdersProvider><StoreProvider>{children}</StoreProvider></OrdersProvider>
      </CatalogProvider>
    </UiProvider>
  </AuthProvider>
);

function mount() {
  const view = renderHook(() => ({ store: useStore(), auth: useAuth() }), { wrapper });
  return { ...view, s: () => view.result.current.store, a: () => view.result.current.auth };
}
type Mounted = ReturnType<typeof mount>;

/** Mounts with Nadia already signed in (the demo adapter keeps its session in localStorage). */
function mountSignedIn() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  return mount();
}

const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });
const addTo = (m: Mounted, product = mug) => run(() => m.s().addToCart(product));
const fillAddress = (m: Mounted) =>
  run(() => {
    const set = m.s().setAddressField;
    set("fullName", "Nadia Putri");
    set("phone", "0811000111");
    set("address", "Jl. Mawar 1");
    set("city", "Jakarta");
    set("postcode", "12345");
  });
const proof = (name = "bukti.png", bytes = 1) => new File([new Uint8Array(bytes)], name);

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

  it("mobile nav: saved shows only wishlist items, home resets every filter", async () => {
    const m = mount();
    await run(() => m.s().mobileNav("saved"));
    expect(m.s().savedOnly).toBe(true);
    expect(m.s().toast).toBe("Wishlist kamu masih kosong");
    expect(m.s().visibleProducts).toEqual([]);
    await run(() => m.s().toggleLike(4));
    expect(m.s().visibleProducts.map((p) => p.id)).toEqual([4]);
    await run(() => {
      m.s().setQuery("zzz");
      m.s().mobileNav("home");
    });
    expect(m.s().savedOnly).toBe(false);
    expect(m.s().query).toBe("");
    expect(m.s().visibleProducts).toHaveLength(6);
  });

  it("choosing a category leaves the wishlist view", async () => {
    const m = mount();
    await run(() => m.s().mobileNav("saved"));
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

  it("mobile nav opens the category sheet, the cart drawer, and the orders panel", async () => {
    const m = mount();
    await run(() => m.s().mobileNav("category"));
    await run(() => m.s().mobileNav("cart"));
    await run(() => m.s().mobileNav("orders"));
    expect(m.s().panels).toMatchObject({ categorySheet: true, drawer: true, orders: true });
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

describe("cart", () => {
  it("makes a guest sign in first, remembers the product, and adds it after sign in", async () => {
    const m = mount();
    await addTo(m, mug);
    expect(m.s().cart).toEqual([]);
    expect(m.a().loginOpen).toBe(true);
    expect(m.a().intent).toBe("cart");

    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.a().loginOpen).toBe(false);
    expect(m.s().cart).toEqual([{ id: 1, qty: 1 }]);
    expect(m.s().signedIn).toBe(true);
  });

  it("adds, counts, and totals for a signed in buyer", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, mug);
    await addTo(m, headphone);
    expect(m.s().cart).toEqual([{ id: 1, qty: 2 }, { id: 3, qty: 1 }]);
    expect(m.s().cartCount).toBe(3);
    expect(m.s().subtotal).toBe(2 * 89000 + 649000);
  });

  it("stops at the available stock with a toast", async () => {
    const m = mountSignedIn();
    await addTo(m, tote); // stock 1
    expect(m.s().toast).toBe("Produk ditambahkan ke keranjang");
    await addTo(m, tote);
    expect(m.s().cart).toEqual([{ id: 2, qty: 1 }]);
    expect(m.s().toast).toBe("Jumlah sudah mencapai stok tersedia");
  });

  it("closes the detail panel when a product is added", async () => {
    const m = mountSignedIn();
    await run(() => m.s().openDetail(mug));
    await addTo(m, mug);
    expect(m.s().panels.detail).toBe(false);
  });

  it("changes quantity within 0 and the stock, and removes at zero", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().changeQty(1, 5));
    expect(m.s().cart).toEqual([{ id: 1, qty: 2 }]); // capped at stock 2
    await run(() => m.s().changeQty(1, -1));
    expect(m.s().cart).toEqual([{ id: 1, qty: 1 }]);
    await run(() => m.s().changeQty(1, -1));
    expect(m.s().cart).toEqual([]);
    await run(() => m.s().changeQty(999, 1)); // unknown product: ignored
    expect(m.s().cart).toEqual([]);
  });

  it("removes a line", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, headphone);
    await run(() => m.s().removeFromCart(1));
    expect(m.s().cart).toEqual([{ id: 3, qty: 1 }]);
  });

  it("keeps the cart per account in this browser and restores it", async () => {
    const first = mountSignedIn();
    await addTo(first, headphone);
    expect(JSON.parse(window.localStorage.getItem("marketplace-cart-v2:nadia") ?? "null")).toEqual([{ id: 3, qty: 1 }]);
    first.unmount();

    const second = mount(); // same browser, session still stored
    expect(second.s().cart).toEqual([{ id: 3, qty: 1 }]);
  });

  it("drops unknown products and clamps quantities when restoring", async () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: 1, qty: 99 }, { id: 999, qty: 1 }, { id: 2, qty: 0 }, { id: 3, qty: "x" }]));
    const m = mountSignedIn();
    expect(m.s().cart).toEqual([{ id: 1, qty: 2 }]);
  });

  it("guests have no cart and nothing is saved for them", async () => {
    const m = mount();
    expect(m.s().cart).toEqual([]);
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("marketplace-cart-v2:"))).toBe(false);
  });

  it("removes the old shared cart key", async () => {
    window.localStorage.setItem("marketplace-cart-v1", "[]");
    mount();
    expect(window.localStorage.getItem("marketplace-cart-v1")).toBeNull();
  });
});

describe("login: where the buyer lands after signing in", () => {
  it("opens the orders panel", async () => {
    const m = mount();
    await run(() => m.a().openLogin("orders"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.a().loginOpen).toBe(false);
    expect(m.s().panels.orders).toBe(true);
  });

  it("opens the chat panel", async () => {
    const m = mount();
    await run(() => m.a().openLogin("chat"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.s().panels.chat).toBe(true);
  });

  it("does not open anything for a plain sign in", async () => {
    const m = mount();
    await run(() => m.a().openLogin());
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.a().loginOpen).toBe(false);
    expect(Object.values(m.s().panels).every((open) => !open)).toBe(true);
  });
});

describe("checkout", () => {
  it("does nothing with an empty cart", async () => {
    const m = mountSignedIn();
    await run(() => m.s().startCheckout());
    expect(m.s().panels.checkout).toBe(false);
  });

  it("opens at step 1, closing the cart drawer, with the name prefilled", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().openPanel("drawer"));
    await run(() => m.s().startCheckout());
    expect(m.s().panels).toMatchObject({ drawer: false, checkout: true });
    expect(m.s().checkoutStep).toBe(1);
    expect(m.s().address.fullName).toBe("Nadia Putri");
  });

  it("will not leave the address step until the required fields are filled", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().startCheckout());
    await run(() => m.s().goCheckoutStep(2));
    expect(m.s().checkoutStep).toBe(1);
    expect(m.s().toast).toBe("Lengkapi alamat pengiriman dulu");

    await fillAddress(m);
    await run(() => m.s().goCheckoutStep(2));
    expect(m.s().checkoutStep).toBe(2);
    await run(() => m.s().goCheckoutStep(1)); // going back needs no validation
    expect(m.s().checkoutStep).toBe(1);
  });

  it("prices shipping by method", async () => {
    const m = mountSignedIn();
    expect(m.s().shipping).toBe("regular");
    expect(m.s().shippingCost).toBe(18000);
    await run(() => m.s().setShipping("express"));
    expect(m.s().shippingCost).toBe(32000);
    await run(() => m.s().setShipping("same-day"));
    expect(m.s().shippingCost).toBe(48000);
  });

  it("accepts a transfer proof up to 5 MB and rejects a bigger one", async () => {
    const m = mountSignedIn();
    let ok = true;
    await run(() => { ok = m.s().setProof(proof("besar.png", 5 * 1024 * 1024 + 1)); });
    expect(ok).toBe(false);
    expect(m.s().proofName).toBe("");
    expect(m.s().toast).toBe("Ukuran file maksimal 5 MB");

    await run(() => { ok = m.s().setProof(proof("bukti.png")); });
    expect(ok).toBe(true);
    expect(m.s().proofName).toBe("bukti.png");
    await run(() => { m.s().setProof(null); });
    expect(m.s().proofName).toBe("");
  });

  it("asks for a proof before placing the order", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Unggah bukti transfer dulu");
    expect(m.s().checkoutStep).toBe(1);
  });

  it("places an order that shows up under the buyer's orders", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, headphone);
    await fillAddress(m);
    await run(() => m.s().setShipping("express"));
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());

    expect(m.s().orderNumber).toBe("837326"); // one above the highest seeded order
    expect(m.s().checkoutStep).toBe(4);
    const placed = m.s().orders.find((o) => o.number === "837326");
    expect(placed).toMatchObject({
      buyerId: "nadia",
      buyer: "Nadia Putri",
      phone: "0811000111",
      address: "Jl. Mawar 1, Jakarta, 12345",
      shippingMethod: "Express",
      shippingFee: 32000,
      payment: "pending",
      received: false,
      items: [{ productId: 1, qty: 1, price: 89000 }, { productId: 3, qty: 1, price: 649000 }],
    });
    expect(m.s().orders[0].number).toBe("837326"); // newest first
  });

  it("finishing an order resets the cart, proof, address, and closes checkout", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().startCheckout());
    await fillAddress(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    await run(() => m.s().finishOrder());

    expect(m.s().cart).toEqual([]);
    expect(m.s().proofName).toBe("");
    expect(m.s().panels.checkout).toBe(false);
    expect(m.s().toast).toBe("Terima kasih sudah berbelanja");
    // Today's behavior: the address is wiped completely and the name is not prefilled again until the next sign in.
    expect(m.s().address).toEqual({ fullName: "", phone: "", address: "", city: "", postcode: "", note: "" });
    expect(JSON.parse(window.localStorage.getItem("marketplace-cart-v2:nadia") ?? "null")).toEqual([]);
  });

  it("opening checkout again starts back at step 1", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().startCheckout());
    await fillAddress(m);
    await run(() => m.s().goCheckoutStep(2));
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().startCheckout());
    expect(m.s().checkoutStep).toBe(1);
  });
});

describe("chat", () => {
  it("starts with the admin's welcome message", async () => {
    const m = mount();
    expect(m.s().chatMessages).toHaveLength(1);
    expect(m.s().chatMessages[0].from).toBe("admin");
  });

  it("asks a guest to sign in instead of sending", async () => {
    const m = mount();
    await run(() => m.s().sendChat("halo"));
    expect(m.s().chatMessages).toHaveLength(1);
    expect(m.a().loginOpen).toBe(true);
    expect(m.a().intent).toBe("chat");
  });

  it("ignores empty messages", async () => {
    const m = mountSignedIn();
    await run(() => m.s().sendChat("   "));
    expect(m.s().chatMessages).toHaveLength(1);
    expect(m.a().loginOpen).toBe(false);
  });

  it("sends a trimmed message and gets an automatic reply that keeps the same ticket id", async () => {
    vi.useFakeTimers();
    const m = mountSignedIn();
    await run(() => m.s().sendChat("  halo  "));
    expect(m.s().chatMessages.map((c) => [c.from, c.text])).toEqual([["admin", m.s().chatMessages[0].text], ["user", "halo"]]);

    await act(async () => { vi.advanceTimersByTime(550); });
    expect(m.s().chatMessages).toHaveLength(3);
    const firstId = /INT-\d{6}/.exec(m.s().chatMessages[2].text)?.[0];
    expect(firstId).toBeDefined();

    await run(() => m.s().sendChat("lagi"));
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(/INT-\d{6}/.exec(m.s().chatMessages[4].text)?.[0]).toBe(firstId);
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
    expect(m.s().toast).toBe("");
  });

  it("starts with the seeded review", async () => {
    expect(mount().s().myReviews["837240:6"]).toMatchObject({ rating: 5 });
  });

  it("validates a review, saves it, and reports an update the second time", async () => {
    const m = mountSignedIn();
    let ok = true;
    await run(() => { ok = m.s().saveReview("837288", 4, { rating: 0, text: "bagus" }); });
    expect(ok).toBe(false);
    expect(m.s().toast).toBe("Pilih rating dulu");

    await run(() => { ok = m.s().saveReview("837288", 4, { rating: 5, text: "" }); });
    expect(ok).toBe(false);
    expect(m.s().toast).toBe("Tulis ulasanmu dulu");
    expect(m.s().myReviews["837288:4"]).toBeUndefined();

    await run(() => { ok = m.s().saveReview("837288", 4, { rating: 5, text: "Lampunya bagus" }); });
    expect(ok).toBe(true);
    expect(m.s().toast).toBe("Terima kasih, ulasanmu terkirim");
    expect(m.s().myReviews["837288:4"]).toEqual({ rating: 5, text: "Lampunya bagus" });

    await run(() => { m.s().saveReview("837288", 4, { rating: 4, text: "Cukup bagus" }); });
    expect(m.s().toast).toBe("Ulasanmu diperbarui");
    expect(m.s().myReviews["837288:4"]).toEqual({ rating: 4, text: "Cukup bagus" });
  });
});
