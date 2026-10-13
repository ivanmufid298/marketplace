// Run with `npm run test:ui`. What the buyer is told about an order, which is finer than what the admin sees.
import { describe, expect, it } from "vitest";
import type { Order } from "./mock/orders";
import { buyerStatus, deriveStatus } from "./order-flow";

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
