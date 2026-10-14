// Run with `npm run test:ui`. The signed-in buyer's cart: adding with the stock limit, quantities, keeping it per account
// in this browser, and what a guest gets. (These were the cart tests of the old StoreProvider; the assertions are the same,
// only the way the cart is reached changed.)
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth";
import { CatalogProvider, useCatalog } from "@/features/catalog";
import { products, type Product } from "@/lib/mock/store";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { CartProvider, useCart } from "./cart-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [mug, tote, headphone] = products; // stock 2, 1, 8

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider><UiProvider><CatalogProvider><CartProvider>{children}</CartProvider></CatalogProvider></UiProvider></AuthProvider>
);
function mount() {
  const view = renderHook(() => ({ cart: useCart(), auth: useAuth(), ui: useUi(), catalog: useCatalog() }), { wrapper });
  return { ...view, c: () => view.result.current.cart, a: () => view.result.current.auth, u: () => view.result.current.ui, k: () => view.result.current.catalog };
}
type Mounted = ReturnType<typeof mount>;
const mountSignedIn = () => {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  return mount();
};
const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });
const addTo = (m: Mounted, product = mug) => run(() => m.c().addToCart(product));

beforeEach(() => { window.localStorage.clear(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("cart", () => {
  it("makes a guest sign in first, remembers the product, and adds it after sign in", async () => {
    const m = mount();
    await addTo(m, mug);
    expect(m.c().cart).toEqual([]);
    expect(m.a().loginOpen).toBe(true);
    expect(m.a().intent).toBe("cart");

    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.a().loginOpen).toBe(false);
    expect(m.c().cart).toEqual([{ id: 1, qty: 1 }]);
  });

  it("adds, counts, and totals for a signed in buyer", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, mug);
    await addTo(m, headphone);
    expect(m.c().cart).toEqual([{ id: 1, qty: 2 }, { id: 3, qty: 1 }]);
    expect(m.c().cartCount).toBe(3);
    expect(m.c().subtotal).toBe(2 * 89000 + 649000);
  });

  it("stops at the available stock with a toast", async () => {
    const m = mountSignedIn();
    await addTo(m, tote); // stock 1
    expect(m.u().toast).toBe("Produk ditambahkan ke keranjang");
    await addTo(m, tote);
    expect(m.c().cart).toEqual([{ id: 2, qty: 1 }]);
    expect(m.u().toast).toBe("Jumlah sudah mencapai stok tersedia");
  });

  it("closes the detail panel when a product is added", async () => {
    const m = mountSignedIn();
    await run(() => m.k().openDetail(mug));
    expect(m.u().panels.detail).toBe(true);
    await addTo(m, mug);
    expect(m.u().panels.detail).toBe(false);
  });

  it("changes quantity within 0 and the stock, and removes at zero", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.c().changeQty(1, 5));
    expect(m.c().cart).toEqual([{ id: 1, qty: 2 }]); // capped at stock 2
    await run(() => m.c().changeQty(1, -1));
    expect(m.c().cart).toEqual([{ id: 1, qty: 1 }]);
    await run(() => m.c().changeQty(1, -1));
    expect(m.c().cart).toEqual([]);
    await run(() => m.c().changeQty(999, 1)); // unknown product: ignored
    expect(m.c().cart).toEqual([]);
  });

  it("removes a line", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, headphone);
    await run(() => m.c().removeFromCart(1));
    expect(m.c().cart).toEqual([{ id: 3, qty: 1 }]);
  });

  it("empties the whole cart", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await addTo(m, headphone);
    await run(() => m.c().clearCart());
    expect(m.c().cart).toEqual([]);
    expect(m.c().cartCount).toBe(0);
    expect(JSON.parse(window.localStorage.getItem("marketplace-cart-v2:nadia") ?? "null")).toEqual([]);
  });

  it("keeps the cart per account in this browser and restores it", async () => {
    const first = mountSignedIn();
    await addTo(first, headphone);
    expect(JSON.parse(window.localStorage.getItem("marketplace-cart-v2:nadia") ?? "null")).toEqual([{ id: 3, qty: 1 }]);
    first.unmount();

    const second = mount(); // same browser, session still stored
    expect(second.c().cart).toEqual([{ id: 3, qty: 1 }]);
  });

  it("drops unknown products and clamps quantities when restoring", async () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: 1, qty: 99 }, { id: 999, qty: 1 }, { id: 2, qty: 0 }, { id: 3, qty: "x" }]));
    const m = mountSignedIn();
    expect(m.c().cart).toEqual([{ id: 1, qty: 2 }]);
  });

  it("guests have no cart and nothing is saved for them", async () => {
    const m = mount();
    expect(m.c().cart).toEqual([]);
    expect(Object.keys(window.localStorage).some((k) => k.startsWith("marketplace-cart-v2:"))).toBe(false);
  });

  it("says when the saved cart has been read, so others do not judge an empty one too early", async () => {
    const m = mountSignedIn();
    expect(m.c().loaded).toBe(true);
    await addTo(m, mug);
    expect(m.c().loaded).toBe(true);
  });

  it("removes the old shared cart key", async () => {
    window.localStorage.setItem("marketplace-cart-v1", "[]");
    mount();
    expect(window.localStorage.getItem("marketplace-cart-v1")).toBeNull();
  });

  it("does not add the remembered product after signing in for something else", async () => {
    const m = mount();
    await addTo(m, mug); // remembered, login open for the cart
    await run(() => m.a().openLogin("orders"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.c().cart).toEqual([]);
  });
});

describe("cart and a catalog that is loading", () => {
  type Listing = { ok: true; value: { products: Product[]; categories: string[] } };
  const listing: Listing = { ok: true, value: { products: [mug, tote, headphone], categories: [] } };

  it("waits for the saved cart to load before adding what a guest picked, so neither is lost", async () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: 3, qty: 1 }]));
    let release: (v: Listing) => void = () => {};
    let calls = 0;
    const listCatalog = () => (++calls === 1 ? Promise.resolve(listing) : new Promise<Listing>((resolve) => { release = resolve; }));
    const guestWrapper = ({ children }: { children: ReactNode }) => (
      <AuthProvider><UiProvider><CatalogProvider services={{ repo: { listCatalog } as never }}><CartProvider>{children}</CartProvider></CatalogProvider></UiProvider></AuthProvider>
    );
    const view = renderHook(() => ({ cart: useCart(), auth: useAuth(), catalog: useCatalog() }), { wrapper: guestWrapper });
    await waitFor(() => expect(view.result.current.catalog.status).toBe("ready"));

    await run(() => view.result.current.cart.addToCart(mug)); // guest: remembered, login opens
    await run(() => view.result.current.catalog.reload()); // the catalog is being read again while the buyer signs in
    await run(async () => { await view.result.current.auth.signIn("nadia@demo.test", "password123"); });
    expect(view.result.current.cart.cart).toEqual([]); // still waiting, nothing added yet
    expect(view.result.current.auth.loginOpen).toBe(true);

    await run(() => release(listing));
    await waitFor(() => expect(view.result.current.cart.cart).toEqual([{ id: 3, qty: 1 }, { id: 1, qty: 1 }]));
    expect(view.result.current.auth.loginOpen).toBe(false);
  });

  it("adds a remembered product once, not again at the next sign in for the cart", async () => {
    const m = mount();
    await addTo(m, mug);
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.c().cart).toEqual([{ id: 1, qty: 1 }]);

    await run(async () => { await m.a().signOut(); });
    await run(() => m.a().openLogin("cart"));
    await run(async () => { await m.a().signIn("nadia@demo.test", "password123"); });
    expect(m.c().cart).toEqual([{ id: 1, qty: 1 }]);
  });
});
