// Run with `npm run test:ui`. What the buyer is told about an order, which is finer than what the admin sees.
import { describe, expect, it } from "vitest";
import type { Order } from "./mock/orders";
import { buyerStatus, deriveStatus, summarizeOrders } from "./order-flow";

const order = (over: Partial<Order> = {}): Order => ({
  number: "1", buyerId: "b", buyer: "B", phone: "1", address: "x", date: "1 Okt 2026", items: [], shippingMethod: "Reguler", shippingFee: 0, payment: "pending", received: false, history: [], ...over,
});

describe("buyerStatus", () => {
  it("says the proof is being checked once it was sent and the admin has not decided", () => {
    expect(buyerStatus(order({ payment: "pending" }))).toBe("verifying");
  });
  it("says the payment is awaited while no proof has been sent", () => {
    expect(buyerStatus(order({ payment: "pending", awaitingProof: true }))).toBe("awaiting_payment");
  });
  it("says the proof was rejected", () => {
    expect(buyerStatus(order({ payment: "failed" }))).toBe("rejected");
  });
  it("follows the shared status once the payment is accepted", () => {
    expect(buyerStatus(order({ payment: "success" }))).toBe("shipping");
    expect(buyerStatus(order({ payment: "success", received: true }))).toBe("completed");
  });
  it("says cancelled whatever the payment was, even while awaiting proof", () => {
    expect(buyerStatus(order({ payment: "pending", cancelNote: "x" }))).toBe("cancelled");
    expect(buyerStatus(order({ payment: "pending", awaitingProof: true, cancelNote: "x" }))).toBe("cancelled");
    expect(buyerStatus(order({ payment: "success", cancelNote: "x" }))).toBe("cancelled");
  });
  it("leaves what the admin sees unchanged: all the unpaid cases are still pending", () => {
    for (const over of [{ payment: "pending" as const }, { payment: "pending" as const, awaitingProof: true }, { payment: "failed" as const }]) expect(deriveStatus(order(over))).toBe("pending");
  });
});

describe("summarizeOrders", () => {
  const priced = (over: Partial<Order> = {}) => order({ items: [{ productId: 1, qty: 2, price: 1000 }], shippingFee: 500, ...over }); // 2.500
  it("is all zeros for no orders", () => {
    expect(summarizeOrders([])).toEqual({ sales: 0, paidCount: 0, toReview: 0, toShip: 0, refundsPending: 0 });
  });
  it("adds up what was sold: paid orders only, goods plus shipping", () => {
    const paid = priced({ payment: "success" });
    expect(summarizeOrders([paid, paid, priced({ payment: "pending" }), priced({ payment: "failed" })])).toMatchObject({ sales: 5000, paidCount: 2 });
  });
  it("counts an order the buyer already received as sold, but no longer to ship", () => {
    expect(summarizeOrders([priced({ payment: "success", received: true })])).toMatchObject({ sales: 2500, paidCount: 1, toShip: 0 });
  });
  it("leaves out a cancelled paid order from the sales, and counts its refund while it is pending", () => {
    const cancelled = priced({ payment: "success", cancelNote: "Rusak", refund: "pending" });
    expect(summarizeOrders([cancelled])).toMatchObject({ sales: 0, paidCount: 0, toShip: 0, refundsPending: 1 });
    expect(summarizeOrders([{ ...cancelled, refund: "done" }]).refundsPending).toBe(0);
  });
  it("counts the proofs waiting for the admin: sent, undecided, not cancelled", () => {
    const orders = [
      priced({ payment: "pending" }),
      priced({ payment: "pending", awaitingProof: true }),
      priced({ payment: "failed" }),
      priced({ payment: "pending", cancelNote: "x" }),
      priced({ payment: "pending", expired: true }),
    ];
    expect(summarizeOrders(orders).toReview).toBe(1);
  });
  it("counts the paid orders still to hand to the courier: no tracking number, not received, not cancelled", () => {
    const orders = [
      priced({ payment: "success" }),
      priced({ payment: "success", tracking: "JP1234567890" }),
      priced({ payment: "success", received: true }),
      priced({ payment: "success", cancelNote: "x" }),
      priced({ payment: "pending" }),
    ];
    expect(summarizeOrders(orders).toShip).toBe(1);
  });
});
