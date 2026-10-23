// Run with `npm run test:ui`. The bottom navigation on phones: what each tab opens, and the cart count. (These were
// the "mobile nav" tests of the old StoreProvider.)
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCart } from "@/features/cart";
import { useCatalog } from "@/features/catalog";
import { products } from "@/lib/mock/store";
import { useUi } from "@/shared/ui-state/ui-provider";
import { Storefront } from "../../providers/storefront-test-support";
import { MobileNav } from "./mobile-nav";

const SESSION_KEY = "marketplace-demo-session-v1";

function Probe() {
  const { panels, toast } = useUi();
  const { savedOnly, query, visibleProducts, toggleLike } = useCatalog();
  const { addToCart } = useCart();
  return (
    <div>
      <output data-testid="state">{JSON.stringify({ open: Object.entries(panels).filter(([, v]) => v).map(([k]) => k), toast, savedOnly, query, visible: visibleProducts.length })}</output>
      <button onClick={() => toggleLike(4)}>like</button>
      <button onClick={() => addToCart(products[0])}>add</button>
    </div>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}");
const tap = (name: string | RegExp) => act(async () => { fireEvent.click(screen.getByRole("button", { name })); });

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" }));
  vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development");
});
afterEach(cleanup);

const mount = () => render(<Storefront><MobileNav /><Probe /></Storefront>);

describe("the bottom navigation", () => {
  it("opens the category sheet, the cart drawer, and the orders panel", async () => {
    mount();
    await tap("Kategori");
    await tap(/Keranjang/);
    await tap(/Pesanan/);
    expect(state().open.sort()).toEqual(["categorySheet", "drawer", "orders"]);
  });

  it("shows only the wishlist under Wishlist, and Home resets every filter", async () => {
    mount();
    await tap("Wishlist");
    expect(state()).toMatchObject({ savedOnly: true, toast: "Wishlist kamu masih kosong", visible: 0 });
    await tap("like");
    expect(state().visible).toBe(1);
    await tap("Home");
    expect(state()).toMatchObject({ savedOnly: false, query: "", visible: 6 });
  });

  it("counts what is in the cart on the Keranjang tab", async () => {
    mount();
    await act(async () => {});
    await tap("add");
    await tap("add");
    expect(screen.getByRole("button", { name: /Keranjang/ }).textContent).toContain("2");
  });

  it("marks the tab of the open panel as the active one", async () => {
    mount();
    await tap(/Pesanan/);
    expect(screen.getByRole("button", { name: /Pesanan/ }).className).toContain("active");
    expect(screen.getByRole("button", { name: "Home" }).className).not.toContain("active");
  });

  it("marks Wishlist and Home active only while no panel covers the page", async () => {
    mount();
    await tap("Wishlist");
    expect(screen.getByRole("button", { name: "Wishlist" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "Home" }).className).not.toContain("active");
    await tap(/Pesanan/);
    expect(screen.getByRole("button", { name: "Wishlist" }).className).not.toContain("active");
  });
});
