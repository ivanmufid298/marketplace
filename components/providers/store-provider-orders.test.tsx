// Run with `npm run test:ui`. Checkout against a database-backed orders module (a fake): what is sent, what the buyer
// is told when it works or fails, and that a second tap cannot place a second order.
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import { CatalogProvider } from "@/features/catalog";
import { OrdersProvider, type OrderServices, type Outcome, type PlacedOrder } from "@/features/orders";
import { products } from "@/lib/mock/store";
import { UiProvider } from "@/shared/ui-state/ui-provider";
import { StoreProvider, useStore } from "./store-provider";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };
const [mug] = products; // id 1, Rp89.000, stock 2

function setup(placeOrder: OrderServices["repo"]["placeOrder"], methods = [{ value: "regular", label: "Reguler", note: "n", cost: 20000 }, { value: "express", label: "Express", note: "n", cost: 35000 }]) {
  const repo = {
    listShippingMethods: vi.fn(async () => ({ ok: true as const, value: methods })),
    listMyOrders: vi.fn(async () => ({ ok: true as const, value: [] })),
    placeOrder: vi.fn(placeOrder),
    sendProof: vi.fn(async () => ({ ok: true as const, value: null })),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider><UiProvider><CatalogProvider><OrdersProvider services={{ repo } as OrderServices}><StoreProvider>{children}</StoreProvider></OrdersProvider></CatalogProvider></UiProvider></AuthProvider>
  );
  const view = renderHook(() => useStore(), { wrapper });
  return { view, repo, s: () => view.result.current };
}
type Setup = ReturnType<typeof setup>;

const run = (fn: () => void | Promise<void>) => act(async () => { await fn(); });
const ok = (over: Partial<PlacedOrder> = {}): Outcome<PlacedOrder> => ({ ok: true, value: { number: "100002", id: "o-1", proofSent: true, ...over } });
const proof = () => new File([new Uint8Array(10)], "bukti.png", { type: "image/png" });

async function readyToPay(m: Setup, { withProof = true } = {}) {
  await run(() => m.s().addToCart(mug));
  await run(() => {
    const set = m.s().setAddressField;
    set("fullName", "Nadia Putri"); set("phone", " 0811000111 "); set("address", " Jl. Mawar 1 "); set("city", "Jakarta"); set("postcode", "12345");
  });
  if (withProof) await run(() => { m.s().setProof(proof()); });
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
});
afterEach(cleanup);

describe("shipping rates", () => {
  it("offers the database's methods and totals with the chosen one's fee", async () => {
    const m = setup(async () => ok());
    await run(() => {});
    expect(m.s().shippingMethods.map((x) => x.value)).toEqual(["regular", "express"]);
    expect(m.s().shippingCost).toBe(20000);
    await run(() => m.s().setShipping("express"));
    expect(m.s().shippingCost).toBe(35000);
  });
  it("falls back to the first method when the chosen one no longer exists", async () => {
    const m = setup(async () => ok(), [{ value: "express", label: "Express", note: "n", cost: 35000 }]);
    await run(() => {});
    expect(m.s().shipping).toBe("regular");
    expect(m.s().shippingCost).toBe(35000);
  });
});

describe("the shipping method that is sent", () => {
  it("is the method actually charged, even when the remembered choice no longer exists", async () => {
    const m = setup(async () => ok(), [{ value: "express", label: "Express", note: "n", cost: 35000 }]);
    await run(() => {});
    await readyToPay(m);
    await run(() => m.s().placeOrder());
    expect(m.repo.placeOrder.mock.calls[0][0].shippingCode).toBe("express");
  });
});

describe("placing the order", () => {
  it("sends what to buy, where, how, and the proof, with the buyer's trimmed details, and moves to the success step", async () => {
    const m = setup(async () => ok());
    await readyToPay(m);
    await run(() => m.s().setShipping("express"));
    await run(() => m.s().placeOrder());
    expect(m.repo.placeOrder).toHaveBeenCalledTimes(1);
    expect(m.repo.placeOrder.mock.calls[0][0]).toMatchObject({
      items: [{ productId: 1, qty: 1, price: 89000 }], shippingCode: "express", recipient: "Nadia Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345",
    });
    expect(m.repo.placeOrder.mock.calls[0][0].proof).toBeInstanceOf(File);
    expect(m.s().orderNumber).toBe("100002");
    expect(m.s().checkoutStep).toBe(4);
    expect(m.s().toast).not.toContain("belum terunggah");
  });
  it("needs a proof first, and sends nothing without one", async () => {
    const m = setup(async () => ok());
    await readyToPay(m, { withProof: false });
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Unggah bukti transfer dulu");
    expect(m.repo.placeOrder).not.toHaveBeenCalled();
  });
  it("names the product that is out of stock and stays on the payment step", async () => {
    const m = setup(async () => ({ ok: false, error: { kind: "outOfStock", productId: 1 } }));
    await readyToPay(m);
    await run(() => m.s().goCheckoutStep(3));
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Stok Mug Blush Daily tidak cukup. Kurangi jumlahnya.");
    expect(m.s().checkoutStep).toBe(3);
    expect(m.s().orderNumber).toBe("000000");
  });
  it("says a product is no longer sold", async () => {
    const m = setup(async () => ({ ok: false, error: { kind: "productUnavailable", productId: 1 } }));
    await readyToPay(m);
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Mug Blush Daily sudah tidak dijual. Hapus dari keranjang.");
  });
  it("says 'this product' when the database names none", async () => {
    const m = setup(async () => ({ ok: false, error: { kind: "outOfStock" } }));
    await readyToPay(m);
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Stok produk ini tidak cukup. Kurangi jumlahnya.");
  });
  it("explains the limit on unpaid orders and a lost connection", async () => {
    const limit = setup(async () => ({ ok: false, error: { kind: "tooManyPending" } }));
    await readyToPay(limit);
    await run(() => limit.s().placeOrder());
    expect(limit.s().toast).toContain("3 pesanan yang belum dibayar");
    cleanup();
    const offline = setup(async () => ({ ok: false, error: { kind: "network" } }));
    await readyToPay(offline);
    await run(() => offline.s().placeOrder());
    expect(offline.s().toast).toBe("Tidak bisa terhubung. Periksa koneksi lalu coba lagi.");
  });
  it("tells the buyer when the order exists but the proof did not go through, and still shows the order number", async () => {
    const m = setup(async () => ok({ proofSent: false, proofError: { kind: "network" } }));
    await readyToPay(m);
    await run(() => m.s().placeOrder());
    expect(m.s().toast).toBe("Pesanan dibuat, tetapi bukti belum terunggah. Kirim lewat Pesanan saya dalam 2 jam.");
    expect(m.s().orderNumber).toBe("100002");
    expect(m.s().checkoutStep).toBe(4);
  });
  it("cannot place two orders with a second tap while the first is running", async () => {
    let finish: (r: Outcome<PlacedOrder>) => void = () => {};
    const m = setup(() => new Promise((resolve) => { finish = resolve; }));
    await readyToPay(m);
    act(() => { void m.s().placeOrder(); });
    expect(m.s().placing).toBe(true);
    await run(() => m.s().placeOrder());
    expect(m.repo.placeOrder).toHaveBeenCalledTimes(1);
    await run(() => finish(ok()));
    expect(m.s().placing).toBe(false);
    expect(m.s().checkoutStep).toBe(4);
  });
  it("lets the buyer try again after a failure", async () => {
    const answers: Outcome<PlacedOrder>[] = [{ ok: false, error: { kind: "network" } }, ok()];
    const m = setup(async () => answers.shift()!);
    await readyToPay(m);
    await run(() => m.s().placeOrder());
    expect(m.s().placing).toBe(false);
    await run(() => m.s().placeOrder());
    expect(m.s().checkoutStep).toBe(4);
    expect(m.repo.placeOrder).toHaveBeenCalledTimes(2);
  });
});

describe("sending a proof later", () => {
  const order = { number: "100002", id: "o-1" } as never;
  it("thanks the buyer when it goes through", async () => {
    const m = setup(async () => ok());
    let sent = false;
    await run(async () => { sent = await m.s().sendOrderProof(order, proof()); });
    expect(sent).toBe(true);
    expect(m.s().toast).toBe("Bukti transfer terkirim. Admin akan memeriksanya.");
  });
  it("explains when the order can no longer be paid", async () => {
    const m = setup(async () => ok());
    m.repo.sendProof.mockResolvedValueOnce({ ok: false, error: { kind: "notPayable" } } as never);
    let sent = true;
    await run(async () => { sent = await m.s().sendOrderProof(order, proof()); });
    expect(sent).toBe(false);
    expect(m.s().toast).toContain("sudah tidak bisa dibayar");
  });
});
