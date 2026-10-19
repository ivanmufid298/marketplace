// Run with `npm run test:ui`. The checkout: opening it, the address step, shipping, the proof, placing the order, and
// finishing. (These were the checkout tests of the old StoreProvider; the assertions are the same, only the way the
// checkout is reached changed. Leaving it half done is in checkout-draft.test.tsx.)
import { AddressesProvider, useAddresses } from "@/features/account";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth";
import { CartProvider, useCart } from "@/features/cart";
import { CatalogProvider, useCatalog } from "@/features/catalog";
import { OrdersProvider, useBuyerOrders } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { resetOrders } from "@/lib/orders-store";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { CheckoutProvider, useCheckout } from "./checkout-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [mug, , headphone] = products;

/** What the checkout reads from its neighbours, in one object. */
function useAll() {
  return { ...useCatalog(), ...useCart(), ...useUi(), ...useBuyerOrders(), ...useCheckout(), auth: useAuth(), book: useAddresses() };
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider><UiProvider><CatalogProvider><OrdersProvider><CartProvider><AddressesProvider><CheckoutProvider>{children}</CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>
);
function mountSignedIn() {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  const view = renderHook(() => useAll(), { wrapper });
  return { ...view, s: () => view.result.current };
}
type Mounted = ReturnType<typeof mountSignedIn>;
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

beforeEach(() => { window.localStorage.clear(); resetOrders(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

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

  it("offers the shop's own rates without any note in the demo, which has no courier prices", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(async () => { await m.s().book.add({ label: "Rumah", recipientName: "Nadia", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12150", note: "" }); });
    expect(m.s().selectedAddressId).not.toBeNull();
    expect(m.s().shippingSource).toBe("manual");
    expect(m.s().shippingFallback).toBeNull();
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

  it("lets a photo be up to 20 MB, since it is shrunk before it is sent, but not a PDF over 5 MB", async () => {
    const m = mountSignedIn();
    const typed = (type: string, bytes: number) => new File([new Uint8Array(bytes)], "x", { type });
    let ok = false;
    await run(() => { ok = m.s().setProof(typed("image/jpeg", 20 * 1024 * 1024)); });
    expect(ok).toBe(true);
    await run(() => { ok = m.s().setProof(typed("image/jpeg", 20 * 1024 * 1024 + 1)); });
    expect(ok).toBe(false);
    await run(() => { ok = m.s().setProof(typed("application/pdf", 5 * 1024 * 1024 + 1)); });
    expect(ok).toBe(false);
    await run(() => { ok = m.s().setProof(typed("application/pdf", 5 * 1024 * 1024)); });
    expect(ok).toBe(true);
  });

  it("accepts a transfer proof up to 5 MB and rejects a bigger one", async () => {
    const m = mountSignedIn();
    let ok = true;
    await run(() => { ok = m.s().setProof(proof("besar.png", 5 * 1024 * 1024 + 1)); });
    expect(ok).toBe(false);
    expect(m.s().proofName).toBe("");
    // Changed on purpose: a photo may now be up to 20 MB (it is shrunk before it is sent); a PDF or unknown file stays at 5 MB.
    expect(m.s().toast).toBe("Ukuran file terlalu besar (foto maksimal 20 MB, PDF maksimal 5 MB)");

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

  it("opening checkout again picks up where it was closed", async () => {
    // Changed on purpose: closing the checkout half way used to throw the progress away; now it is kept (and a
    // notification reminds the buyer), so reopening it resumes at the same step.
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().startCheckout());
    await fillAddress(m);
    await run(() => m.s().goCheckoutStep(2));
    await run(() => m.s().closePanel("checkout"));
    await run(() => m.s().startCheckout());
    expect(m.s().checkoutStep).toBe(2);
    expect(m.s().address.city).toBe("Jakarta");
  });
});


describe("checkout details", () => {
  it("asks for every required address field, the postcode included", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().startCheckout());
    for (const missing of ["fullName", "phone", "address", "city", "postcode"] as const) {
      await fillAddress(m);
      await run(() => m.s().setAddressField(missing, "   "));
      await run(() => m.s().goCheckoutStep(2));
      expect(m.s().checkoutStep, missing).toBe(1);
    }
  });

  it("does not take the typed name back when the same account signs in again", async () => {
    const m = mountSignedIn();
    await run(() => m.s().setAddressField("fullName", "Budi"));
    await run(async () => { await m.s().auth.signOut(); });
    await run(async () => { await m.s().auth.signIn("nadia@demo.test", "password123"); });
    expect(m.s().address.fullName).toBe("Budi");
  });

  it("sends the account's name as the recipient when the name field was cleared", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await fillAddress(m);
    await run(() => m.s().setAddressField("fullName", "  "));
    await run(() => { m.s().setProof(proof()); });
    await run(() => m.s().placeOrder());
    expect(m.s().orders[0].buyer).toBe("Nadia Putri");
  });
});

describe("signing in for the checkout", () => {
  // The login dialog opens for a signed in buyer here only to see what the checkout does when it finds a user while the
  // dialog is open. (A buyer whose session ended has no cart left either, so a real sign in lands on an empty cart.)
  it("opens the checkout and closes the login dialog when there is a cart", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().auth.openLogin("checkout"));
    expect(m.s().auth.loginOpen).toBe(false);
    expect(m.s().panels.checkout).toBe(true);
    expect(m.s().panels.drawer).toBe(false);
  });

  it("closes the dialog but opens nothing when the cart is empty", async () => {
    const m = mountSignedIn();
    await run(() => m.s().auth.openLogin("checkout"));
    expect(m.s().auth.loginOpen).toBe(false);
    expect(m.s().panels.checkout).toBe(false);
  });

  it("leaves the checkout shut, and the dialog alone, when the login is for something else", async () => {
    const m = mountSignedIn();
    await addTo(m, mug);
    await run(() => m.s().auth.openLogin("orders"));
    expect(m.s().panels.checkout).toBe(false);
    expect(m.s().auth.loginOpen).toBe(true);
  });
});
