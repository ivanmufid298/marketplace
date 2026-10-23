// Run with `npm run test:ui`. The number on the orders icon (header and phone tab bar): orders that wait for the buyer to tap
// "Pesanan selesai". It counts paid orders that are not done or cancelled, and nothing else.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptPayment, cancelOrder, confirmReceived, createOrder, resetOrders } from "@/lib/orders-store";
import { Storefront } from "../../providers/storefront-test-support";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";

const SESSION_KEY = "marketplace-demo-session-v1";
const ZOE = { id: "zoe", email: "zoe@demo.test", name: "Zoe" };
const make = (buyerId = "zoe") => createOrder({ buyerId, buyer: "Zoe", phone: "0811", address: "Jl. A", items: [{ productId: 1, qty: 1, price: 1000 }], shippingMethod: "Reguler", shippingFee: 18000 });
const paid = (buyerId = "zoe") => { const n = make(buyerId); acceptPayment(n); return n; };

beforeEach(() => { window.localStorage.clear(); resetOrders(); window.localStorage.setItem(SESSION_KEY, JSON.stringify(ZOE)); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); });
afterEach(cleanup);

const mount = () => render(<Storefront><Header /><MobileNav /></Storefront>);
const headerOrders = () => document.querySelector(".header .actions") as HTMLElement;
const badge = () => headerOrders().querySelector('button[aria-label^="Pesanan saya"] .count')?.textContent ?? null;
const tabBadge = () => [...document.querySelectorAll(".mobile-tab")].find((t) => t.textContent?.includes("Pesanan"))?.querySelector(".mobile-count")?.textContent ?? null;

describe("the badge on the orders icon", () => {
  it("shows nothing when no order waits for the buyer", () => {
    mount();
    expect(badge()).toBeNull();
    expect(tabBadge()).toBeNull();
    expect(screen.getByRole("button", { name: "Pesanan saya" })).toBeTruthy();
  });
  it("counts a paid order in the header and on the phone tab, and says so to a screen reader", () => {
    paid();
    mount();
    expect(badge()).toBe("1");
    expect(tabBadge()).toBe("1");
    expect(screen.getByRole("button", { name: "Pesanan saya, 1 menunggu kamu tandai selesai" })).toBeTruthy();
  });
  it("does not count an order that is unpaid, being checked, cancelled, or already done", () => {
    make();
    const cancelled = paid(); cancelOrder(cancelled, "Rusak");
    const done = paid(); confirmReceived(done);
    mount();
    expect(badge()).toBeNull();
    expect(tabBadge()).toBeNull();
  });
  it("counts each order that waits, and no one else's", () => {
    paid(); paid(); paid("someone-else");
    mount();
    expect(badge()).toBe("2");
    expect(tabBadge()).toBe("2");
  });
  it("shows 9+ in the header from ten orders on", () => {
    for (let i = 0; i < 10; i++) paid();
    mount();
    expect(badge()).toBe("9+");
  });
  it("goes away when the buyer marks the order done, without a reload", async () => {
    const n = paid();
    mount();
    expect(badge()).toBe("1");
    await act(async () => { confirmReceived(n); });
    expect(badge()).toBeNull();
    expect(tabBadge()).toBeNull();
  });
  it("is not shown to a visitor who is not signed in", () => {
    window.localStorage.removeItem(SESSION_KEY);
    paid();
    mount();
    expect(badge()).toBeNull();
  });
});
