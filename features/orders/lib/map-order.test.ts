// Run with `npm run test:ui`. How a row of the orders table becomes the order the shop screens show.
import { describe, expect, it } from "vitest";
import { toOrder, type OrderRow } from "./map-order";

const photoFor = (key: string, alt: string) => ({ src: `https://cdn.test/${key}-400.webp`, srcSet: `https://cdn.test/${key}-400.webp 400w`, alt, width: null, height: null });
const NOW = Date.parse("2026-10-13T12:00:00Z");
const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: "o-1", number: "100002", recipient_name: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1", city: "Jakarta", postcode: "12345", shipping_label: "Express", shipping_fee: 32000,
  payment_status: "awaiting_payment", expires_at: "2026-10-13T13:00:00Z", received_at: null, cancel_note: null, refund_status: null, created_at: "2026-10-13T11:00:00Z",
  order_items: [{ id: 41, product_id: 1, product_name: "Longchamp", product_slug: "longchamp", image_key: "products/1/a.webp", unit_price: 189000, quantity: 2 }], ...over,
});
const map = (over: Partial<OrderRow> = {}) => toOrder(row(over), "buyer-1", photoFor, NOW);

describe("the tracking number", () => {
  it("carries the courier's tracking number when the order has one", () => {
    expect(map({ payment_status: "paid", tracking_number: "JP1234567890" }).tracking).toBe("JP1234567890");
  });
  it("has none when the row has none, or does not say", () => {
    expect(map({ tracking_number: null })).not.toHaveProperty("tracking");
    expect(map()).not.toHaveProperty("tracking");
  });
});

describe("the details", () => {
  it("carries the number, buyer, phone, shipping, and a joined address", () => {
    expect(map()).toMatchObject({ id: "o-1", number: "100002", buyerId: "buyer-1", buyer: "Ana Putri", phone: "0811000111", address: "Jl. Mawar 1, Jakarta, 12345", shippingMethod: "Express", shippingFee: 32000 });
  });
  it("writes the date in Jakarta time, and keeps no history (the panel does not show it)", () => {
    expect(map({ created_at: "2026-10-13T20:00:00Z" }).date).toBe("14 Okt 2026");
    expect(map().history).toEqual([]);
  });
  it("copies each item as bought: product id, quantity, the price paid, name, slug, and cover photo", () => {
    expect(map().items).toEqual([{ itemId: 41, productId: 1, qty: 2, price: 189000, name: "Longchamp", slug: "longchamp", photos: [photoFor("products/1/a.webp", "Longchamp")] }]);
  });
  it("leaves out the slug and uses no photo when the item has none, and id 0 when the product is gone", () => {
    expect(map({ order_items: [{ product_id: null, product_name: "Lama", product_slug: null, image_key: null, unit_price: 1, quantity: 1 }] }).items).toEqual([{ productId: 0, qty: 1, price: 1, name: "Lama", photos: [] }]);
  });
  it("leaves out the item id when the row has none", () => {
    expect(map({ order_items: [{ product_id: 1, product_name: "X", product_slug: null, image_key: null, unit_price: 1, quantity: 1 }] }).items[0]).not.toHaveProperty("itemId");
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

describe("a rejected payment", () => {
  const rejected = (over: Partial<OrderRow> = {}) => map({ payment_status: "rejected", payment_rejection_reason: "Nominal salah", reupload_until: "2026-10-13T13:00:00Z", ...over });
  it("carries the reason, is a failed payment, and lets the buyer send proof until the window closes", () => {
    const order = rejected();
    expect(order).toMatchObject({ payment: "failed", rejectionReason: "Nominal salah", canSendProof: true, payBefore: "2026-10-13T13:00:00Z" });
    expect(order).not.toHaveProperty("awaitingProof");
    expect(order.expired).toBeUndefined();
  });
  it("is expired once the window has closed, with no more proof allowed", () => {
    const order = rejected({ reupload_until: "2026-10-13T12:00:00Z" });
    expect(order.expired).toBe(true);
    expect(order).not.toHaveProperty("canSendProof");
  });
  it("allows no proof when the database gave no window", () => {
    expect(rejected({ reupload_until: null })).not.toHaveProperty("canSendProof");
  });
  it("shows no reason on an order that is no longer rejected, even if the row still holds one", () => {
    expect(map({ payment_status: "paid", payment_rejection_reason: "Nominal salah" })).not.toHaveProperty("rejectionReason");
    expect(map({ payment_status: "under_review", payment_rejection_reason: "Nominal salah" })).not.toHaveProperty("rejectionReason");
  });
  it("shows no reason when there is none", () => {
    expect(rejected({ payment_rejection_reason: null })).not.toHaveProperty("rejectionReason");
  });
});

describe("who may send proof", () => {
  it("an unpaid order inside its time", () => {
    expect(map()).toMatchObject({ canSendProof: true, payBefore: "2026-10-13T13:00:00Z" });
  });
  it("nobody, once the proof is under review, accepted, or expired", () => {
    for (const payment_status of ["under_review", "paid", "expired"] as const) expect(map({ payment_status })).not.toHaveProperty("canSendProof");
  });
});

describe("the admin's extra data", () => {
  it("lists the history oldest first, with who did it and the note", () => {
    const order = map({
      order_status_history: [
        { event: "payment_accepted", actor_name: "Siti", note: null, created_at: "2026-10-13T11:30:00Z" },
        { event: "created", actor_name: "Ana", note: null, created_at: "2026-10-13T11:00:00Z" },
        { event: "payment_rejected", actor_name: "Siti", note: "Nominal salah", created_at: "2026-10-13T11:20:00Z" },
      ],
    });
    expect(order.history).toEqual([
      { at: "13 Okt 2026, 18.00", event: "created", actor: "Ana" },
      { at: "13 Okt 2026, 18.20", event: "payment_rejected", actor: "Siti", note: "Nominal salah" },
      { at: "13 Okt 2026, 18.30", event: "payment_accepted", actor: "Siti" },
    ]);
  });
  it("lists the proofs oldest first, so the newest is the last", () => {
    const order = map({
      payment_proofs: [
        { object_key: "orders/o-1/b.png", mime_type: "image/png", size_bytes: 2048, created_at: "2026-10-13T11:40:00Z" },
        { object_key: "orders/o-1/a.pdf", mime_type: "application/pdf", size_bytes: 100, created_at: "2026-10-13T11:10:00Z" },
      ],
    });
    expect(order.proofs).toEqual([
      { objectKey: "orders/o-1/a.pdf", mime: "application/pdf", size: 100, at: "13 Okt 2026, 18.10" },
      { objectKey: "orders/o-1/b.png", mime: "image/png", size: 2048, at: "13 Okt 2026, 18.40" },
    ]);
  });
  it("has no proofs field at all when the proofs were not loaded, and an empty list when there are none", () => {
    expect(map()).not.toHaveProperty("proofs");
    expect(map({ payment_proofs: [] }).proofs).toEqual([]);
  });
});
