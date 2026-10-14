// Run with `npm run test:ui`. Leaving the checkout half done: the step is kept, reopening resumes it, a reminder is raised
// while it is unfinished, and it survives a reload.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import { OrdersProvider } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider, useStore } from "./store-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const DRAFT_KEY = "marketplace-checkout-v1:nadia";
const [mug] = products;

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider><UiProvider><CatalogProvider><OrdersProvider><StoreProvider>{children}</StoreProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>
);
const mount = () => {
  const view = renderHook(() => useStore(), { wrapper });
  return { view, s: () => view.result.current };
};
type M = ReturnType<typeof mount>;
const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });
const fill = (m: M) => run(() => {
  const set = m.s().setAddressField;
  set("fullName", "Nadia Putri"); set("phone", "0811000111"); set("address", "Jl. Mawar 1"); set("city", "Jakarta"); set("postcode", "12345");
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const proof = () => new File([new Uint8Array(1)], "bukti.png");

async function toPayment(m: M) {
  await run(() => m.s().addToCart(mug));
  await run(() => m.s().startCheckout());
  await fill(m);
  await run(() => m.s().setShipping("express"));
  await run(() => m.s().goCheckoutStep(2));
  await run(() => m.s().goCheckoutStep(3));
}
const draft = () => JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null");

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "nadia", email: "n@demo.test", name: "Nadia" }));
  vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});
afterEach(cleanup);

describe("closing the checkout half done", () => {
  it("resumes at payment when reopened, with the address and shipping as they were", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().startCheckout());
    expect(m.s().checkoutStep).toBe(3);
    expect(m.s().panels.checkout).toBe(true);
    expect(m.s().address.city).toBe("Jakarta");
    expect(m.s().shipping).toBe("express");
  });
  it("keeps the proof that was chosen", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().startCheckout());
    expect(m.s().proofName).toBe("bukti.png");
  });
  it("starts at the address when the checkout was only just opened and closed", async () => {
    const m = mount();
    await run(() => m.s().addToCart(mug));
    await run(() => m.s().startCheckout());
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().startCheckout());
    expect(m.s().checkoutStep).toBe(1);
  });
  it("starts at the address again after an order was placed", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    expect(m.s().checkoutStep).toBe(4);
    await run(() => m.s().finishOrder());
    await run(() => m.s().addToCart(mug));
    await run(() => m.s().startCheckout());
    expect(m.s().checkoutStep).toBe(1);
  });
});

describe("the reminder", () => {
  it("is raised once the checkout is closed past the address step, with the step it stopped at", async () => {
    const m = mount();
    await toPayment(m);
    expect(m.s().pendingCheckout).toBeNull(); // still open: nothing to remind about
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().pendingCheckout).toEqual({ step: 3 });
  });
  it("names the shipping step when it stopped there", async () => {
    const m = mount();
    await run(() => m.s().addToCart(mug));
    await run(() => m.s().startCheckout());
    await fill(m);
    await run(() => m.s().goCheckoutStep(2));
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().pendingCheckout).toEqual({ step: 2 });
  });
  it("is not raised for a checkout closed on the address step, or never started", async () => {
    const m = mount();
    expect(m.s().pendingCheckout).toBeNull();
    await run(() => m.s().addToCart(mug));
    await run(() => m.s().startCheckout());
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().pendingCheckout).toBeNull();
  });
  it("goes away when the checkout is reopened, and comes back when it is closed again", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().resumeCheckout());
    expect(m.s().panels.checkout).toBe(true);
    expect(m.s().pendingCheckout).toBeNull();
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().pendingCheckout).toEqual({ step: 3 });
  });
  it("resuming closes the notifications panel and opens the checkout", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().openPanel("notifications"));
    await run(() => m.s().resumeCheckout());
    expect(m.s().panels).toMatchObject({ notifications: false, checkout: true });
  });
  it("goes away when the order is placed", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().pendingCheckout).toBeNull();
  });
  it("goes away when the cart is emptied, and the checkout starts over", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().removeFromCart(mug.id));
    expect(m.s().pendingCheckout).toBeNull();
    expect(m.s().checkoutStep).toBe(1);
  });
  it("is not there for a signed-out visitor", () => {
    window.localStorage.clear();
    expect(mount().s().pendingCheckout).toBeNull();
  });
});

describe("closing from the success screen", () => {
  it("finishes the order, so the cart is not left full of what was just bought", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    expect(m.s().cart).toHaveLength(1);
    await run(() => m.s().closePanel("checkout"));
    expect(m.s().cart).toEqual([]);
    expect(m.s().toast).toBe("Terima kasih sudah berbelanja");
  });
  it("does not finish twice when the shopper used the back-to-shop button", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    await run(() => m.s().finishOrder());
    await run(() => m.s().addToCart(mug));
    expect(m.s().cart).toHaveLength(1); // a later purchase is not wiped by a second finish
  });
  it("leaves the cart alone when the success screen was never open (the panel closed before)", async () => {
    const m = mount();
    await run(() => m.s().addToCart(mug));
    await fill(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    await flush();
    expect(m.s().cart).toHaveLength(1);
  });
});

describe("surviving a reload", () => {
  it("keeps the step, address, and shipping on this device while the checkout is half done", async () => {
    const m = mount();
    await toPayment(m);
    expect(draft()).toMatchObject({ step: 3, shipping: "express", address: { city: "Jakarta", fullName: "Nadia Putri" } });
  });
  it("brings it back after a reload, at the same step", async () => {
    const first = mount();
    await toPayment(first);
    first.view.unmount();
    const second = mount();
    await flush();
    expect(second.s().checkoutStep).toBe(3);
    expect(second.s().address.city).toBe("Jakarta");
    expect(second.s().shipping).toBe("express");
    expect(second.s().pendingCheckout).toEqual({ step: 3 });
  });
  it("forgets it once the order is placed and finished", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    await run(() => m.s().finishOrder());
    expect(draft()).toBeNull();
  });
  it("forgets it when back on the address step, or when the cart is emptied", async () => {
    const m = mount();
    await toPayment(m);
    await run(() => m.s().goCheckoutStep(1));
    expect(draft()).toBeNull();
    await run(() => m.s().goCheckoutStep(2));
    expect(draft()).not.toBeNull();
    await run(() => m.s().removeFromCart(mug.id));
    expect(draft()).toBeNull();
  });
  it("is not brought back when the cart it was for is gone", async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 3, address: { city: "Jakarta" }, shipping: "express" }));
    const m = mount();
    await flush();
    expect(m.s().checkoutStep).toBe(1);
    expect(m.s().pendingCheckout).toBeNull();
    expect(m.s().address.city).toBe(""); // not even the address is brought back for a cart that is gone
    expect(m.s().shipping).toBe("regular");
  });
  it("ignores a draft that is unreadable or claims a step it cannot be at", async () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: mug.id, qty: 1 }]));
    window.localStorage.setItem(DRAFT_KEY, "{not json");
    expect(mount().s().checkoutStep).toBe(1);
    cleanup();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 4, address: {}, shipping: "regular" }));
    const m = mount();
    await flush();
    expect(m.s().checkoutStep).toBe(1);
  });
  it("brings back only the address fields it knows, and only as text", async () => {
    window.localStorage.setItem("marketplace-cart-v2:nadia", JSON.stringify([{ id: mug.id, qty: 1 }]));
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: 2, address: { city: "Bandung", postcode: 123, evil: "x" }, shipping: 5 }));
    const m = mount();
    await flush();
    expect(m.s().address.city).toBe("Bandung");
    expect(m.s().address.postcode).toBe("");
    expect((m.s().address as Record<string, unknown>).evil).toBeUndefined();
    expect(m.s().shipping).toBe("regular");
  });
  it("keeps one account's draft from reaching another", async () => {
    const first = mount();
    await toPayment(first);
    first.view.unmount();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: "bima", email: "b@demo.test", name: "Bima" }));
    const other = mount();
    await flush();
    expect(other.s().checkoutStep).toBe(1);
    expect(other.s().pendingCheckout).toBeNull();
  });
});
