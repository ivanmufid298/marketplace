// Run with `npm run test:ui`. How a row of the orders table becomes the order the shop screens show.
import { describe, expect, it } from "vitest";
import { toOrder, type OrderRow } from "./map-order";

const photoFor = (key: string, alt: string) => ({ src: `https://cdn.test/${key}-400.webp`, srcSet: `https://cdn.test/${key}-400.webp 400w`, alt, width: null, height: null });
const NOW = Date.parse("2026-10-13T12:00:00Z");
const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: "o-1", number: "100002", recipient_name: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", shipping_label: "Express", shipping_fee: 32000,
  payment_status: "awaiting_payment", expires_at: "2026-10-13T13:00:00Z", received_at: null, cancel_note: null, refund_status: null, created_at: "2026-10-13T11:00:00Z",
  order_items: [{ product_id: 1, product_name: "Longchamp", product_slug: "longchamp", image_key: "products/1/a.webp", unit_price: 189000, quantity: 2 }], ...over,
});
const map = (over: Partial<OrderRow> = {}) => toOrder(row(over), "buyer-1", photoFor, NOW);

describe("the details", () => {
  it("carries the number, buyer, phone, shipping, and a joined address", () => {
    expect(map()).toMatchObject({ id: "o-1", number: "100002", buyerId: "buyer-1", buyer: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1, Jakarta, 12345", shippingMethod: "Express", shippingFee: 32000 });
  });
  it("writes the date in Jakarta time, and keeps no history (the panel does not show it)", () => {
    expect(map({ created_at: "2026-10-13T20:00:00Z" }).date).toBe("14 Okt 2026");
    expect(map().history).toEqual([]);
  });
  it("copies each item as bought: product id, quantity, the price paid, name, slug, and cover photo", () => {
    expect(map().items).toEqual([{ productId: 1, qty: 2, price: 189000, name: "Longchamp", slug: "longchamp", photos: [photoFor("products/1/a.webp", "Longchamp")] }]);
  });
  it("leaves out the slug and uses no photo when the item has none, and id 0 when the product is gone", () => {
    expect(map({ order_items: [{ product_id: null, product_name: "Lama", product_slug: null, image_key: null, unit_price: 1, quantity: 1 }] }).items).toEqual([{ productId: 0, qty: 1, price: 1, name: "Lama", photos: [] }]);
  });
  it("has no items for an order row without them", () => {
    expect(map({ order_items: null }).items).toEqual([]);
    expect(map({ order_items: undefined }).items).toEqual([]);
  });
});

describe("the payment", () => {
  it("awaiting payment: pending, awaiting proof, with the deadline", () => {
    const order = map();
    expect(order).toMatchObject({ payment: "pending", awaitingProof: true, payBefore: "2026-10-13T13:00:00Z" });
    expect(order.expired).toBeUndefined();
  });
  it("under review: pending, with proof sent (not awaiting)", () => {
    const order = map({ payment_status: "under_review" });
    expect(order.payment).toBe("pending");
    expect(order).not.toHaveProperty("awaitingProof");
    expect(order).not.toHaveProperty("payBefore");
  });
  it("paid is success and rejected is failed", () => {
    expect(map({ payment_status: "paid" }).payment).toBe("success");
    expect(map({ payment_status: "rejected" }).payment).toBe("failed");
  });
  it("expired: marked expired, no longer awaiting proof", () => {
    const order = map({ payment_status: "expired" });
    expect(order.expired).toBe(true);
    expect(order).not.toHaveProperty("awaitingProof");
  });
  it("an unpaid order past its deadline counts as expired even before the database job has run", () => {
    const order = map({ expires_at: "2026-10-13T11:59:59Z" });
    expect(order.expired).toBe(true);
    expect(order).not.toHaveProperty("awaitingProof");
  });
  it("an unpaid order exactly at its deadline is out of time, and one second before is not", () => {
    expect(map({ expires_at: "2026-10-13T12:00:00Z" }).expired).toBe(true);
    expect(map({ expires_at: "2026-10-13T12:00:01Z" }).expired).toBeUndefined();
  });
  it("an order under review is not expired by the clock, since its proof was sent in time", () => {
    expect(map({ payment_status: "under_review", expires_at: "2026-10-13T11:00:00Z" }).expired).toBeUndefined();
  });
});

describe("the end of an order", () => {
  it("is received once received_at is set", () => {
    expect(map({ payment_status: "paid", received_at: "2026-10-14T00:00:00Z" }).received).toBe(true);
    expect(map().received).toBe(false);
  });
  it("carries the cancellation note and the refund status", () => {
    expect(map({ cancel_note: "Barang rusak", refund_status: "pending" })).toMatchObject({ cancelNote: "Barang rusak", refund: "pending" });
    expect(map()).not.toHaveProperty("cancelNote");
    expect(map()).not.toHaveProperty("refund");
  });
});
