// Run with `npm run test:ui`. The buyer's orders: where they come from (the database when there are credentials or a
// fake is given, this browser otherwise), loading, failing, placing an order, and sending proof.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/features/auth";
import type { Order } from "@/lib/mock/orders";
import { resetOrders } from "@/lib/orders-store";
import { OrdersProvider, useBuyerOrders } from "./orders-provider";
import type { OrderServices } from "./lib/services";
import type { Outcome, PlaceOrderInput, PlacedOrder } from "./lib/types";

const SESSION_KEY = "marketplace-demo-session-v1";
const NADIA = { id: "nadia", email: "nadia@demo.test", name: "Nadia Putri" };

const dbOrder = (over: Partial<Order> = {}): Order => ({
  id: "o-1", number: "100002", buyerId: "nadia", buyer: "Nadia", phone: "1", address: "x", date: "13 Okt 2026", items: [], shippingMethod: "Reguler", shippingFee: 18000, payment: "pending", received: false, history: [], ...over,
});
const placeInput = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({ items: [{ productId: 1, qty: 1, price: 89000 }], shippingCode: "express", recipient: "Nadia", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", proof: null, ...over });

function fakeServices(over: Partial<OrderServices["repo"]> = {}) {
  const repo = {
    listShippingMethods: vi.fn(async () => ({ ok: true as const, value: [{ value: "regular", label: "Reguler", note: "n", cost: 20000 }] })),
    listMyOrders: vi.fn(async (): Promise<Outcome<Order[]>> => ({ ok: true, value: [dbOrder()] })),
    placeOrder: vi.fn(async (): Promise<Outcome<PlacedOrder>> => ({ ok: true, value: { number: "100003", id: "o-3", proofSent: true } })),
    sendProof: vi.fn(async (): Promise<Outcome<null>> => ({ ok: true, value: null })),
    ...over,
  };
  return { services: { repo } as OrderServices, repo };
}

const signIn = () => window.localStorage.setItem(SESSION_KEY, JSON.stringify(NADIA));
const mount = (services?: OrderServices) => renderHook(() => useBuyerOrders(), {
  wrapper: ({ children }: { children: ReactNode }) => <AuthProvider><OrdersProvider services={services}>{children}</OrdersProvider></AuthProvider>,
});

beforeEach(() => { window.localStorage.clear(); resetOrders(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("from the database", () => {
  it("shows no orders and reads nothing for a signed-out visitor", async () => {
    const { services, repo } = fakeServices();
    const view = mount(services);
    await waitFor(() => expect(view.result.current.ordersStatus).toBe("ready"));
    expect(view.result.current.orders).toEqual([]);
    expect(repo.listMyOrders).not.toHaveBeenCalled();
  });
  it("loads the signed-in buyer's orders", async () => {
    signIn();
    const { services, repo } = fakeServices();
    const view = mount(services);
    await waitFor(() => expect(view.result.current.orders).toHaveLength(1));
    expect(view.result.current.ordersStatus).toBe("ready");
    expect(repo.listMyOrders).toHaveBeenCalledWith("nadia");
  });
  it("starts out loading", () => {
    signIn();
    const { services } = fakeServices({ listMyOrders: () => new Promise(() => {}) });
    expect(mount(services).result.current.ordersStatus).toBe("loading");
  });
  it("reports an error and keeps showing the orders it had", async () => {
    signIn();
    const listMyOrders = vi.fn<OrderServices["repo"]["listMyOrders"]>().mockResolvedValueOnce({ ok: true, value: [dbOrder()] }).mockResolvedValueOnce({ ok: false, error: { kind: "network" } });
    const view = mount(fakeServices({ listMyOrders }).services);
    await waitFor(() => expect(view.result.current.orders).toHaveLength(1));
    await act(async () => view.result.current.reload());
    await waitFor(() => expect(view.result.current.ordersStatus).toBe("error"));
    expect(view.result.current.orders).toHaveLength(1);
  });
  it("never shows the sample orders, whoever is signed in", async () => {
    signIn();
    const { services } = fakeServices({ listMyOrders: async () => ({ ok: true, value: [] }) });
    const view = mount(services);
    await waitFor(() => expect(view.result.current.ordersStatus).toBe("ready"));
    expect(view.result.current.orders).toEqual([]);
  });
});

describe("shipping methods", () => {
  it("shows the sample rates until the real ones arrive, then the real ones", async () => {
    const { services } = fakeServices();
    const view = mount(services);
    expect(view.result.current.shippingMethods.map((m) => m.value)).toEqual(["regular", "express", "same-day"]);
    await waitFor(() => expect(view.result.current.shippingMethods).toEqual([{ value: "regular", label: "Reguler", note: "n", cost: 20000 }]));
  });
  it("keeps the sample rates when the real ones come back empty or fail", async () => {
    const empty = mount(fakeServices({ listShippingMethods: async () => ({ ok: true, value: [] }) }).services);
    await act(async () => {});
    expect(empty.result.current.shippingMethods).toHaveLength(3);
    cleanup();
    const failed = mount(fakeServices({ listShippingMethods: async () => ({ ok: false, error: { kind: "network" } }) }).services);
    await act(async () => {});
    expect(failed.result.current.shippingMethods).toHaveLength(3);
  });
});

describe("placing an order", () => {
  it("hands the request to the database and reloads the orders after success", async () => {
    signIn();
    const { services, repo } = fakeServices();
    const view = mount(services);
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(1));
    let result: Outcome<PlacedOrder> | undefined;
    await act(async () => { result = await view.result.current.placeOrder(placeInput()); });
    expect(result).toEqual({ ok: true, value: { number: "100003", id: "o-3", proofSent: true } });
    expect(repo.placeOrder).toHaveBeenCalledWith(placeInput());
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(2));
  });
  it("returns the refusal and does not reload", async () => {
    signIn();
    const { services, repo } = fakeServices({ placeOrder: async () => ({ ok: false, error: { kind: "outOfStock", productId: 1 } }) });
    const view = mount(services);
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(1));
    let result: Outcome<PlacedOrder> | undefined;
    await act(async () => { result = await view.result.current.placeOrder(placeInput()); });
    expect(result).toEqual({ ok: false, error: { kind: "outOfStock", productId: 1 } });
    expect(repo.listMyOrders).toHaveBeenCalledTimes(1);
  });
});

describe("sending proof", () => {
  it("sends the file for the order's id and reloads", async () => {
    signIn();
    const { services, repo } = fakeServices();
    const view = mount(services);
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(1));
    const file = new File(["x"], "b.png", { type: "image/png" });
    let result: Outcome<null> | undefined;
    await act(async () => { result = await view.result.current.sendProof(dbOrder({ id: "o-1" }), file); });
    expect(result).toEqual({ ok: true, value: null });
    expect(repo.sendProof).toHaveBeenCalledWith("o-1", file);
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(2));
  });
  it("does not reload when the proof was refused", async () => {
    signIn();
    const { services, repo } = fakeServices({ sendProof: async () => ({ ok: false, error: { kind: "notPayable" } }) });
    const view = mount(services);
    await waitFor(() => expect(repo.listMyOrders).toHaveBeenCalledTimes(1));
    await act(async () => { await view.result.current.sendProof(dbOrder(), new File(["x"], "b.png", { type: "image/png" })); });
    expect(repo.listMyOrders).toHaveBeenCalledTimes(1);
  });
  it("refuses an order that has no database id", async () => {
    const { services, repo } = fakeServices();
    const view = mount(services);
    let result: Outcome<null> | undefined;
    await act(async () => { result = await view.result.current.sendProof(dbOrder({ id: undefined }), new File(["x"], "b.png")); });
    expect(result).toEqual({ ok: false, error: { kind: "unknown" } });
    expect(repo.sendProof).not.toHaveBeenCalled();
  });
  it("cannot confirm receipt in the database yet", () => {
    expect(mount(fakeServices().services).result.current.confirmReceived("100002")).toBe(false);
  });
});

describe("in this browser (no database)", () => {
  it("shows the signed-in buyer's own sample orders, ready at once", () => {
    signIn();
    const view = mount();
    expect(view.result.current.ordersStatus).toBe("ready");
    expect(view.result.current.orders.length).toBeGreaterThan(0);
    expect(view.result.current.orders.every((o) => o.buyerId === "nadia")).toBe(true);
  });
  it("shows no orders to a signed-out visitor", () => {
    expect(mount().result.current.orders).toEqual([]);
  });
  it("places an order in the local store, with the chosen method's fee, and lists it", async () => {
    signIn();
    const view = mount();
    const before = view.result.current.orders.length;
    let result: Outcome<PlacedOrder> | undefined;
    await act(async () => { result = await view.result.current.placeOrder(placeInput({ shippingCode: "express", items: [{ productId: 1, qty: 2, price: 89000 }] })); });
    expect(result?.ok && result.value.proofSent).toBe(true);
    expect(view.result.current.orders).toHaveLength(before + 1);
    expect(view.result.current.orders[0]).toMatchObject({ number: result?.ok ? result.value.number : "", shippingMethod: "Express", shippingFee: 32000, items: [{ productId: 1, qty: 2, price: 89000 }] });
  });
  it("refuses to place an order for a signed-out visitor", async () => {
    const view = mount();
    let result: Outcome<PlacedOrder> | undefined;
    await act(async () => { result = await view.result.current.placeOrder(placeInput()); });
    expect(result).toEqual({ ok: false, error: { kind: "notSignedIn" } });
  });
  it("lets the buyer confirm receipt of a paid order", async () => {
    signIn();
    const view = mount();
    let done = false;
    act(() => { done = view.result.current.confirmReceived("837288"); });
    expect(done).toBe(true);
    expect(view.result.current.orders.find((o) => o.number === "837288")?.received).toBe(true);
    let again = true;
    act(() => { again = view.result.current.confirmReceived("837288"); });
    expect(again).toBe(false);
  });
});
