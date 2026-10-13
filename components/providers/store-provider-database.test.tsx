// Run with `npm run test:ui`. The saved cart against a catalog that loads from the database. The cart is checked
// against the catalog when it is restored, so it has to wait for the catalog; otherwise it would be checked against an
// empty list and the shopper's saved cart would be erased.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import type { Product } from "@/lib/mock/store";
import { resetOrders } from "@/lib/orders-store";
import { OrdersProvider } from "@/features/orders";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider, useStore } from "./store-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const CART_KEY = "marketplace-cart-v2:nadia";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const mug: Product = { id: 11, name: "Mug", cat: "Rumah", price: 89000, stock: 5, desc: "", photos: [] };

type Result = { ok: true; value: { products: Product[]; categories: string[] } } | { ok: false; error: { kind: "network" } };

function mountWith(listCatalog: () => Promise<Result>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>
      <UiProvider>
        <CatalogProvider services={{ repo: { listCatalog } as never }}>
          <OrdersProvider><StoreProvider>{children}</StoreProvider></OrdersProvider>
        </CatalogProvider>
      </UiProvider>
    </AuthProvider>
  );
  return renderHook(() => useStore(), { wrapper });
}
const saved = () => JSON.parse(window.localStorage.getItem(CART_KEY) ?? "null");

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  window.localStorage.setItem(CART_KEY, JSON.stringify([{ id: 11, qty: 2 }]));
  resetOrders();
});
afterEach(cleanup);

describe("cart and a database catalog", () => {
  it("keeps the saved cart while the catalog loads, then restores it", async () => {
    let finish: (v: Result) => void = () => {};
    const view = mountWith(() => new Promise((resolve) => { finish = resolve; }));
    // Signed in and ready, but the catalog is still loading: nothing may be restored, and nothing may be saved over.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(view.result.current.cart).toEqual([]);
    expect(saved()).toEqual([{ id: 11, qty: 2 }]);
    await act(async () => finish({ ok: true, value: { products: [mug], categories: ["Rumah"] } }));
    await waitFor(() => expect(view.result.current.cart).toEqual([{ id: 11, qty: 2 }]));
    expect(saved()).toEqual([{ id: 11, qty: 2 }]);
  });

  it("keeps the saved cart untouched when the catalog fails to load", async () => {
    const view = mountWith(async () => ({ ok: false, error: { kind: "network" } }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(view.result.current.cart).toEqual([]);
    expect(saved()).toEqual([{ id: 11, qty: 2 }]);
  });

  it("drops lines for products that are no longer sold, once the catalog is known", async () => {
    window.localStorage.setItem(CART_KEY, JSON.stringify([{ id: 11, qty: 9 }, { id: 99, qty: 1 }]));
    const view = mountWith(async () => ({ ok: true, value: { products: [mug], categories: ["Rumah"] } }));
    await waitFor(() => expect(view.result.current.cart).toEqual([{ id: 11, qty: 5 }]));
  });
});
