// Run with `npm run test:ui`. The tracking number in the sample orders store (the demo's stand-in for the orders table).
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptPayment, cancelOrder, confirmReceived, createOrder, resetOrders, setTracking, useOrders } from "./orders-store";

const make = () => createOrder({ buyerId: "b", buyer: "Ana", phone: "0811", address: "Jl. A", items: [{ productId: 1, qty: 1, price: 1000 }], shippingMethod: "Reguler", shippingFee: 18000 });
const find = (number: string) => renderHook(() => useOrders()).result.current.find((o) => o.number === number);

beforeEach(() => { window.localStorage.clear(); resetOrders(); });
afterEach(cleanup);

describe("setTracking", () => {
  it("records the number on a paid order and says so in the history, by the admin, with the number", () => {
    const number = make();
    act(() => { acceptPayment(number); });
    expect(setTracking(number, "JP1234567890")).toBe(true);
    const order = find(number);
    expect(order?.tracking).toBe("JP1234567890");
    expect(order?.history.at(-1)).toMatchObject({ event: "shipped", actor: "Admin", note: "JP1234567890" });
  });
  it("records a different number as an update, and the same number again as nothing", () => {
    const number = make();
    acceptPayment(number);
    setTracking(number, "JP1234567890");
    expect(setTracking(number, "JP1234567890")).toBe(false);
    expect(setTracking(number, "JP9999999999")).toBe(true);
    const order = find(number);
    expect(order?.tracking).toBe("JP9999999999");
    expect(order?.history.filter((h) => h.event === "shipped" || h.event === "tracking_updated").map((h) => `${h.event}:${h.note}`)).toEqual(["shipped:JP1234567890", "tracking_updated:JP9999999999"]);
  });
  it("refuses an order that is not paid", () => {
    const number = make();
    expect(setTracking(number, "JP1234567890")).toBe(false);
    expect(find(number)?.tracking).toBeUndefined();
  });
  it("refuses a cancelled order and one the buyer already received", () => {
    const cancelled = make();
    acceptPayment(cancelled);
    cancelOrder(cancelled, "Rusak");
    expect(setTracking(cancelled, "JP1234567890")).toBe(false);
    const received = make();
    acceptPayment(received);
    confirmReceived(received);
    expect(setTracking(received, "JP1234567890")).toBe(false);
  });
  it("refuses an order that is not there", () => {
    expect(setTracking("000000", "JP1234567890")).toBe(false);
  });
});
