// Run with `npm run test:ui`. The checkout's shipping choices when the shop uses courier prices: asked for the saved address's place,
// the cheapest chosen first, the order placed with the signed quote, and the shop's own rates when prices cannot be had.
import { AddressesProvider, useAddresses } from "@/features/account";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CartProvider, useCart } from "@/features/cart";
import { CatalogProvider } from "@/features/catalog";
import { OrdersProvider, type OrderServices, type PlaceOrderInput } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider, useUi } from "@/shared/ui-state/ui-provider";
import { CheckoutProvider, useCheckout } from "./checkout-provider";

// The demo has no courier prices; these tests are about the database mode, so the auth module says so (everything else is real).
vi.mock("@/features/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth")>();
  return { ...actual, useAuth: () => ({ ...actual.useAuth(), mode: "supabase" as const }) };
});

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [mug] = products;
const PLACE = { destinationId: 17536, destinationLabel: "CIPETE UTARA, KEBAYORAN BARU" };
const OPTIONS = [
  { courier: "sicepat", courierName: "SiCepat", service: "REG", description: "Layanan reguler", fee: 9000, etd: "1-2 day", token: "tok-sicepat" },
  { courier: "jne", courierName: "JNE", service: "YES", description: "Yakin esok sampai", fee: 21000, etd: "1 day", token: "tok-jne" },
];

const placeOrder = vi.fn<(input: PlaceOrderInput) => Promise<unknown>>();
const services = {
  repo: {
    listShippingMethods: async () => ({ ok: true, value: [{ value: "regular", label: "Reguler", note: "3-5 hari", cost: 18000 }] }),
    listMyOrders: async () => ({ ok: true, value: [] }),
    sendProof: async () => ({ ok: true, value: null }),
    confirmReceived: async () => ({ ok: true, value: null }),
    placeOrder: (input: PlaceOrderInput) => placeOrder(input),
  },
} as unknown as OrderServices;

function useAll() {
  return { ...useCart(), ...useUi(), ...useCheckout(), addresses: useAddresses() };
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider><UiProvider><CatalogProvider><OrdersProvider services={services}><CartProvider><AddressesProvider><CheckoutProvider>{children}</CheckoutProvider></AddressesProvider></CartProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>
);
const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

/** A signed-in buyer with one item in the cart, an address saved (with a place unless told not), and the checkout open. */
async function mountCheckout(place: typeof PLACE | null = PLACE) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  const view = renderHook(() => useAll(), { wrapper });
  const s = () => view.result.current;
  await run(() => s().addToCart(mug));
  await run(async () => {
    await s().addresses.add({ label: "Rumah", recipientName: "Nadia Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12150", note: "", ...(place ?? {}) });
  });
  await run(() => s().startCheckout());
  return { s, view };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  fetchMock.mockReset();
  placeOrder.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("checkout shipping with courier prices", () => {
  it("asks for the prices of this cart to the saved address's place, sending only what the shop needs to look up", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/shipping/quote");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ destinationId: 17536, items: [{ productId: mug.id, qty: 1 }] });
  });

  it("lists each service with the courier, its description and estimate, and its price, the cheapest chosen first", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    expect(s().shippingMethods).toEqual([
      { value: "api:sicepat:reg", label: "SiCepat REG", note: "Layanan reguler · Estimasi 1-2 hari", cost: 9000, quoteToken: "tok-sicepat" },
      { value: "api:jne:yes", label: "JNE YES", note: "Yakin esok sampai · Estimasi 1 hari", cost: 21000, quoteToken: "tok-jne" },
    ]);
    expect(s().shippingCost).toBe(9000);
    expect(s().shippingFallback).toBeNull();
    await run(() => s().setShipping("api:jne:yes"));
    expect(s().shippingCost).toBe(21000);
  });

  it("shows nothing to choose, and will not place an order, while the prices are on their way", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { s } = await mountCheckout();
    expect(s().shippingSource).toBe("loading");
    expect(s().shippingMethods).toEqual([]);
    await run(() => { s().setProof(new File([new Uint8Array(1)], "bukti.png")); });
    await run(() => s().placeOrder());
    expect(placeOrder).not.toHaveBeenCalled();
    expect(s().toast).toBe("Ongkos kirim masih dihitung. Tunggu sebentar.");
  });

  it("places the order with the chosen service's signed quote and the saved address it is for", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    placeOrder.mockResolvedValue({ ok: true, value: { number: "100001", id: "o-1", proofSent: true } });
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    await run(() => s().setShipping("api:jne:yes"));
    await run(() => { s().setProof(new File([new Uint8Array(1)], "bukti.png")); });
    await run(() => s().placeOrder());
    const sent = placeOrder.mock.calls[0][0];
    expect(sent.shippingQuote).toEqual({ token: "tok-jne", addressId: s().selectedAddressId });
    expect(sent.shippingQuote?.addressId).toBeTruthy();
    expect(s().checkoutStep).toBe(4);
  });

  it("asks again and goes back to the shipping step when the database no longer accepts the quote", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    placeOrder.mockResolvedValue({ ok: false, error: { kind: "shippingQuoteChanged" } });
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    await run(() => s().goCheckoutStep(2));
    await run(() => s().goCheckoutStep(3));
    await run(() => { s().setProof(new File([new Uint8Array(1)], "bukti.png")); });
    await run(() => s().placeOrder());
    expect(s().checkoutStep).toBe(2);
    expect(s().toast).toBe("Ongkos kirim perlu dihitung ulang karena isi keranjang, alamat, atau pengaturan toko berubah. Pilih layanan pengiriman lagi.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("uses the shop's own rates for this address when the database cannot check courier prices at all", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    placeOrder.mockResolvedValue({ ok: false, error: { kind: "shippingQuoteUnavailable" } });
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    await run(() => { s().setProof(new File([new Uint8Array(1)], "bukti.png")); });
    await run(() => s().placeOrder());
    await waitFor(() => expect(s().shippingSource).toBe("manual"));
    expect(s().shippingMethods.map((m) => m.value)).toEqual(["regular"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(s().shippingMethods.some((m) => m.quoteToken)).toBe(false);
  });
});

describe("checkout shipping when courier prices cannot be had", () => {
  it("uses the shop's own rates, and says the address has no place, when it was saved by hand", async () => {
    const { s } = await mountCheckout(null);
    expect(s().shippingSource).toBe("manual");
    expect(s().shippingFallback).toBe("noPlace");
    expect(s().shippingMethods.map((m) => m.value)).toEqual(["regular"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["the shop has not set where it ships from", 503, { error: "originMissing" }],
    ["the day's free hits are used up", 429, { error: "quota" }],
    ["the provider is down", 503, { error: "unavailable" }],
    ["no courier serves the place", 422, { error: "noRates" }],
    ["the answer is not what was expected", 200, { options: [{ nonsense: true }] }],
    ["the answer is not JSON", 200, "<html>"],
  ])("uses the shop's own rates when %s", async (_why, status, body) => {
    fetchMock.mockImplementation(() => (typeof body === "string" ? Promise.resolve(new Response(body, { status })) : reply(status, body)));
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("manual"));
    expect(s().shippingFallback).toBe("failed");
    expect(s().shippingMethods.map((m) => m.value)).toEqual(["regular"]);
    expect(s().shippingCost).toBe(18000);
  });

  it("uses the shop's own rates when the request itself fails, and can try again", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Failed to fetch"));
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingFallback).toBe("failed"));
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    await run(() => s().retryShipping());
    await waitFor(() => expect(s().shippingSource).toBe("quote"));
    expect(s().shippingFallback).toBeNull();
    expect(s().shippingCost).toBe(9000);
  });

  it("places an order at the shop's own rate, with no quote, when that is what was offered", async () => {
    fetchMock.mockImplementation(() => reply(503, { error: "unavailable" }));
    placeOrder.mockResolvedValue({ ok: true, value: { number: "100001", id: "o-1", proofSent: true } });
    const { s } = await mountCheckout();
    await waitFor(() => expect(s().shippingSource).toBe("manual"));
    await run(() => { s().setProof(new File([new Uint8Array(1)], "bukti.png")); });
    await run(() => s().placeOrder());
    expect(placeOrder.mock.calls[0][0]).toMatchObject({ shippingCode: "regular" });
    expect(placeOrder.mock.calls[0][0].shippingQuote).toBeUndefined();
  });

  it("asks nothing while the checkout is closed", async () => {
    fetchMock.mockImplementation(() => reply(200, { options: OPTIONS }));
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
    const view = renderHook(() => useAll(), { wrapper });
    await run(() => view.result.current.addToCart(mug));
    await run(async () => { await view.result.current.addresses.add({ label: "Rumah", recipientName: "Nadia", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12150", note: "", ...PLACE }); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
