// Run with `npm run test:ui`. The orders the admin works with: where they come from, the actions, and what happens when
// the database refuses. The database is a fake; who may do what is covered by the SQL tests.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/mock/orders";
import { resetOrders } from "@/lib/orders-store";
import { useAdminOrders } from "./admin-orders";
import type { AdminOrderServices } from "./lib/services";
import type { Outcome } from "./lib/types";

const order = (over: Partial<Order> = {}): Order => ({
  id: "o-1", number: "100002", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "13 Okt 2026", items: [], shippingMethod: "Reguler", shippingFee: 0, payment: "pending", received: false, history: [], ...over,
});
const okNull = async (): Promise<Outcome<null>> => ({ ok: true, value: null });

function fake(over: Partial<AdminOrderServices["repo"]> = {}) {
  const repo = {
    listAllOrders: vi.fn(async (): Promise<Outcome<Order[]>> => ({ ok: true, value: [order()] })),
    acceptPayment: vi.fn(okNull), rejectPayment: vi.fn(okNull), cancelOrder: vi.fn(okNull), markRefunded: vi.fn(okNull), setTrackingNumber: vi.fn(okNull),
    proofLink: vi.fn(async (): Promise<Outcome<string>> => ({ ok: true, value: "https://signed.test/x" })),
    ...over,
  };
  return { services: { repo } as AdminOrderServices, repo };
}

beforeEach(() => { window.localStorage.clear(); resetOrders(); vi.unstubAllEnvs(); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); });
afterEach(cleanup);

describe("from the database", () => {
  it("starts out loading, then lists every order", async () => {
    let finish: (r: Outcome<Order[]>) => void = () => {};
    const { services } = fake({ listAllOrders: () => new Promise((resolve) => { finish = resolve; }) });
    const view = renderHook(() => useAdminOrders(services));
    expect(view.result.current.status).toBe("loading");
    expect(view.result.current.database).toBe(true);
    expect(view.result.current.orders).toEqual([]);
    await act(async () => finish({ ok: true, value: [order(), order({ id: "o-2", number: "100003" })] }));
    expect(view.result.current.status).toBe("ready");
    expect(view.result.current.orders).toHaveLength(2);
  });
  it("reports a failed read and keeps the orders it had", async () => {
    const listAllOrders = vi.fn<AdminOrderServices["repo"]["listAllOrders"]>().mockResolvedValueOnce({ ok: true, value: [order()] }).mockResolvedValueOnce({ ok: false, error: { kind: "network" } });
    const view = renderHook(() => useAdminOrders(fake({ listAllOrders }).services));
    await waitFor(() => expect(view.result.current.orders).toHaveLength(1));
    await act(async () => view.result.current.reload());
    await waitFor(() => expect(view.result.current.status).toBe("error"));
    expect(view.result.current.orders).toHaveLength(1);
  });
  it("never shows the sample orders", async () => {
    const view = renderHook(() => useAdminOrders(fake({ listAllOrders: async () => ({ ok: true, value: [] }) }).services));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current.orders).toEqual([]);
  });
  it("reads again when the admin comes back to the tab", async () => {
    const { services, repo } = fake();
    renderHook(() => useAdminOrders(services));
    await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(2));
  });
  it("does not read when the tab is hidden", async () => {
    const { services, repo } = fake();
    renderHook(() => useAdminOrders(services));
    await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(repo.listAllOrders).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});

describe("actions in the database", () => {
  const cases: [string, keyof AdminOrderServices["repo"], (a: ReturnType<typeof useAdminOrders>, o: Order) => Promise<Outcome<unknown>>, unknown[]][] = [
    ["accepting a payment", "acceptPayment", (a, o) => a.acceptPayment(o), ["o-1"]],
    ["rejecting a payment", "rejectPayment", (a, o) => a.rejectPayment(o, "  Nominal salah "), ["o-1", "Nominal salah"]],
    ["cancelling an order", "cancelOrder", (a, o) => a.cancelOrder(o, " Barang rusak "), ["o-1", "Barang rusak"]],
    ["marking a refund", "markRefunded", (a, o) => a.markRefunded(o), ["o-1"]],
    ["entering a tracking number", "setTrackingNumber", (a, o) => a.setTrackingNumber(o, "  JP1234567890 "), ["o-1", "JP1234567890"]],
  ];
  for (const [name, method, run, args] of cases) {
    it(`${name} goes to the database with the order's id, then the list is read again`, async () => {
      const { services, repo } = fake();
      const view = renderHook(() => useAdminOrders(services));
      await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
      let result: Outcome<unknown> | undefined;
      await act(async () => { result = await run(view.result.current, order()); });
      expect(result).toEqual({ ok: true, value: null });
      expect(repo[method]).toHaveBeenCalledWith(...args);
      await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(2));
    });
    it(`${name} that the database refuses is reported and does not reload`, async () => {
      const { services, repo } = fake({ [method]: async () => ({ ok: false, error: { kind: "forbidden" } }) } as never);
      const view = renderHook(() => useAdminOrders(services));
      await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
      let result: Outcome<unknown> | undefined;
      await act(async () => { result = await run(view.result.current, order()); });
      expect(result).toEqual({ ok: false, error: { kind: "forbidden" } });
      expect(repo.listAllOrders).toHaveBeenCalledTimes(1);
    });
    it(`${name} for an order with no database id is refused without asking`, async () => {
      const { services, repo } = fake();
      const view = renderHook(() => useAdminOrders(services));
      await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
      let result: Outcome<unknown> | undefined;
      await act(async () => { result = await run(view.result.current, order({ id: undefined })); });
      expect(result).toEqual({ ok: false, error: { kind: "orderNotFound" } });
      expect(repo[method]).not.toHaveBeenCalled();
    });
  }
  it("refuses a tracking number of the wrong shape without asking the database", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
    for (const bad of ["", "   ", "AB12", "JP 1234567890", "JP1234567890!", "A".repeat(41)]) {
      let result: Outcome<unknown> | undefined;
      await act(async () => { result = await view.result.current.setTrackingNumber(order(), bad); });
      expect(result).toEqual({ ok: false, error: { kind: "invalidTracking" } });
    }
    expect(repo.setTrackingNumber).not.toHaveBeenCalled();
  });
  it("needs a reason to reject and a reason to cancel, without asking the database", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    await waitFor(() => expect(repo.listAllOrders).toHaveBeenCalledTimes(1));
    let reject: Outcome<unknown> | undefined, cancel: Outcome<unknown> | undefined;
    await act(async () => { reject = await view.result.current.rejectPayment(order(), "   "); cancel = await view.result.current.cancelOrder(order(), ""); });
    expect(reject).toEqual({ ok: false, error: { kind: "reasonRequired" } });
    expect(cancel).toEqual({ ok: false, error: { kind: "noteRequired" } });
    expect(repo.rejectPayment).not.toHaveBeenCalled();
    expect(repo.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("opening a proof", () => {
  const withProofs = order({ proofs: [{ objectKey: "orders/o-1/a.png", mime: "image/png", size: 1, at: "x" }, { objectKey: "orders/o-1/b.png", mime: "image/png", size: 1, at: "y" }] });
  it("asks for a link to the newest proof", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    let result: Outcome<string | null> | undefined;
    await act(async () => { result = await view.result.current.proofLink(withProofs); });
    expect(result).toEqual({ ok: true, value: "https://signed.test/x" });
    expect(repo.proofLink).toHaveBeenCalledWith("orders/o-1/b.png");
  });
  it("asks for the proof at the position given, not only the newest", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    await act(async () => { await view.result.current.proofLink(withProofs, 0); });
    expect(repo.proofLink).toHaveBeenCalledWith("orders/o-1/a.png");
  });
  it("has no link for a position that does not exist", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    let result: Outcome<string | null> | undefined;
    await act(async () => { result = await view.result.current.proofLink(withProofs, 5); });
    expect(result).toEqual({ ok: true, value: null });
    expect(repo.proofLink).not.toHaveBeenCalled();
  });
  it("has no link for an order with no proof", async () => {
    const { services, repo } = fake();
    const view = renderHook(() => useAdminOrders(services));
    let result: Outcome<string | null> | undefined;
    await act(async () => { result = await view.result.current.proofLink(order({ proofs: [] })); });
    expect(result).toEqual({ ok: true, value: null });
    expect(repo.proofLink).not.toHaveBeenCalled();
  });
  it("passes on why a link could not be made", async () => {
    const view = renderHook(() => useAdminOrders(fake({ proofLink: async () => ({ ok: false, error: { kind: "forbidden" } }) }).services));
    let result: Outcome<string | null> | undefined;
    await act(async () => { result = await view.result.current.proofLink(withProofs); });
    expect(result).toEqual({ ok: false, error: { kind: "forbidden" } });
  });
});

describe("in this browser (the sample store)", () => {
  const sample = (view: ReturnType<typeof renderHook<ReturnType<typeof useAdminOrders>, unknown>>, number: string) => view.result.current.orders.find((o) => o.number === number)!;

  it("lists every sample order, ready at once, and is not the database", () => {
    const view = renderHook(() => useAdminOrders());
    expect(view.result.current.status).toBe("ready");
    expect(view.result.current.database).toBe(false);
    expect(view.result.current.orders.length).toBeGreaterThan(5);
  });
  it("accepts and rejects a pending payment, and refuses what is not pending", async () => {
    const view = renderHook(() => useAdminOrders());
    let accepted: Outcome<unknown> | undefined, again: Outcome<unknown> | undefined;
    await act(async () => { accepted = await view.result.current.acceptPayment(sample(view, "837312")); });
    expect(accepted).toEqual({ ok: true, value: null });
    expect(sample(view, "837312").payment).toBe("success");
    await act(async () => { again = await view.result.current.acceptPayment(sample(view, "837312")); });
    expect(again).toEqual({ ok: false, error: { kind: "notReviewable" } });
    let rejected: Outcome<unknown> | undefined;
    await act(async () => { rejected = await view.result.current.rejectPayment(sample(view, "837301"), "Nominal salah"); });
    expect(rejected).toEqual({ ok: true, value: null });
    expect(sample(view, "837301")).toMatchObject({ payment: "failed", rejectionReason: "Nominal salah" });
    expect(sample(view, "837301").history.at(-1)).toMatchObject({ event: "payment_rejected", note: "Nominal salah" });
  });
  it("enters a tracking number on a paid order, trimmed, and refuses one that is not paid", async () => {
    const view = renderHook(() => useAdminOrders());
    let unpaid: Outcome<unknown> | undefined, saved: Outcome<unknown> | undefined;
    await act(async () => { unpaid = await view.result.current.setTrackingNumber(sample(view, "837312"), "JP1234567890"); });
    expect(unpaid).toEqual({ ok: false, error: { kind: "notShippable" } });
    await act(async () => { await view.result.current.acceptPayment(sample(view, "837312")); });
    await act(async () => { saved = await view.result.current.setTrackingNumber(sample(view, "837312"), "  JP1234567890 "); });
    expect(saved).toEqual({ ok: true, value: null });
    expect(sample(view, "837312").tracking).toBe("JP1234567890");
    expect(sample(view, "837312").history.at(-1)).toMatchObject({ event: "shipped", note: "JP1234567890" });
  });
  it("needs a reason to reject, and a note to cancel", async () => {
    const view = renderHook(() => useAdminOrders());
    let reject: Outcome<unknown> | undefined, cancel: Outcome<unknown> | undefined;
    await act(async () => { reject = await view.result.current.rejectPayment(sample(view, "837301"), " "); cancel = await view.result.current.cancelOrder(sample(view, "837301"), ""); });
    expect(reject).toEqual({ ok: false, error: { kind: "reasonRequired" } });
    expect(cancel).toEqual({ ok: false, error: { kind: "noteRequired" } });
  });
  it("cancels an order, sends a paid one to refund, and records the refund once", async () => {
    const view = renderHook(() => useAdminOrders());
    let cancelled: Outcome<unknown> | undefined, refunded: Outcome<unknown> | undefined, again: Outcome<unknown> | undefined, twice: Outcome<unknown> | undefined;
    await act(async () => { cancelled = await view.result.current.cancelOrder(sample(view, "837288"), "Barang rusak"); });
    expect(cancelled).toEqual({ ok: true, value: null });
    expect(sample(view, "837288")).toMatchObject({ cancelNote: "Barang rusak", refund: "pending" });
    await act(async () => { again = await view.result.current.cancelOrder(sample(view, "837288"), "lagi"); });
    expect(again).toEqual({ ok: false, error: { kind: "notCancellable" } });
    await act(async () => { refunded = await view.result.current.markRefunded(sample(view, "837288")); });
    expect(refunded).toEqual({ ok: true, value: null });
    await act(async () => { twice = await view.result.current.markRefunded(sample(view, "837288")); });
    expect(twice).toEqual({ ok: false, error: { kind: "notRefundable" } });
  });
  it("keeps no proof files, so there is never a link", async () => {
    const view = renderHook(() => useAdminOrders());
    let result: Outcome<string | null> | undefined;
    await act(async () => { result = await view.result.current.proofLink(sample(view, "837312")); });
    expect(result).toEqual({ ok: true, value: null });
  });
  it("puts the sample orders back", async () => {
    const view = renderHook(() => useAdminOrders());
    await act(async () => { await view.result.current.acceptPayment(sample(view, "837312")); });
    act(() => view.result.current.resetSample());
    expect(sample(view, "837312").payment).toBe("pending");
  });
});
