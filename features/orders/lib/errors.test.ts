// Run with `npm run test:ui`. How a failure in the database or the connection becomes a reason the shop can word.
import { describe, expect, it } from "vitest";
import { mapOrderError } from "./errors";

describe("mapOrderError", () => {
  it("maps each code the order functions raise", () => {
    const cases: [string, string][] = [
      ["not_signed_in", "notSignedIn"], ["invalid_items", "invalidItems"], ["invalid_address", "invalidAddress"], ["invalid_shipping", "invalidShipping"],
      ["invalid_quote", "shippingQuoteChanged"], ["quote_stale", "shippingQuoteChanged"], ["quote_mismatch", "shippingQuoteChanged"], ["quote_unavailable", "shippingQuoteUnavailable"],
      ["too_many_pending", "tooManyPending"], ["order_not_found", "orderNotFound"], ["not_payable", "notPayable"], ["invalid_proof", "invalidProof"],
      ["not_reviewable", "notReviewable"], ["reason_required", "reasonRequired"], ["note_required", "noteRequired"], ["not_cancellable", "notCancellable"],
      ["not_refundable", "notRefundable"], ["not_receivable", "notReceivable"], ["forbidden", "forbidden"],
    ];
    for (const [message, kind] of cases) expect(mapOrderError({ code: "P0001", message })).toEqual({ kind });
  });
  it("names the product for an unavailable or sold-out product", () => {
    expect(mapOrderError({ code: "P0001", message: "out_of_stock", details: "12" })).toEqual({ kind: "outOfStock", productId: 12 });
    expect(mapOrderError({ code: "P0001", message: "product_unavailable", details: "7" })).toEqual({ kind: "productUnavailable", productId: 7 });
  });
  it("still maps them when the product id is missing or not a number", () => {
    expect(mapOrderError({ code: "P0001", message: "out_of_stock" })).toEqual({ kind: "outOfStock" });
    expect(mapOrderError({ code: "P0001", message: "out_of_stock", details: "abc" })).toEqual({ kind: "outOfStock" });
    expect(mapOrderError({ code: "P0001", message: "out_of_stock", details: "0" })).toEqual({ kind: "outOfStock" });
    expect(mapOrderError({ code: "P0001", message: "out_of_stock", details: "-3" })).toEqual({ kind: "outOfStock" });
  });
  it("does not attach a product id to a reason that is not about a product", () => {
    expect(mapOrderError({ code: "P0001", message: "invalid_items", details: "5" })).toEqual({ kind: "invalidItems" });
  });
  it("maps a signed-out caller by its error code too", () => {
    expect(mapOrderError({ code: "28000", message: "anything" })).toEqual({ kind: "notSignedIn" });
  });
  it("maps a request that never reached the server", () => {
    for (const message of ["Failed to fetch", "NetworkError when attempting to fetch", "Load failed", "TypeError: fetch failed"]) expect(mapOrderError({ message })).toEqual({ kind: "network" });
  });
  it("does not call a database error a network error just because of its words", () => {
    expect(mapOrderError({ code: "XX000", message: "network exploded" })).toEqual({ kind: "unknown" });
  });
  it("maps a refusal by Row Level Security or missing privileges", () => {
    expect(mapOrderError({ code: "42501", message: "permission denied for function place_order" })).toEqual({ kind: "forbidden" });
    expect(mapOrderError({ message: "new row violates row-level security policy" })).toEqual({ kind: "forbidden" });
  });
  it("falls back to unknown", () => {
    expect(mapOrderError({ code: "XX000", message: "boom" })).toEqual({ kind: "unknown" });
    expect(mapOrderError(null)).toEqual({ kind: "unknown" });
    expect(mapOrderError(undefined)).toEqual({ kind: "unknown" });
  });
});
