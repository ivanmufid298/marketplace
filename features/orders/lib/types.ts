/** One way to ship, as the checkout lists it. `value` is the method's code in the database. */
export type ShippingMethod = { value: string; label: string; note: string; cost: number };

export type PlaceOrderItem = {
  productId: number;
  qty: number;
  /** Only the local demo uses this. The database takes the price from the product, never from the browser. */
  price: number;
};

export type PlaceOrderInput = {
  items: PlaceOrderItem[];
  shippingCode: string;
  recipient: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  /** The transfer proof chosen at checkout. */
  proof: File | null;
  /**
   * Set when the shipping cost is a courier's price from /api/shipping/quote: the quote's signed token and the saved address
   * it was asked for. The database then checks the token and sends the order to that address; `shippingCode` is not used.
   */
  shippingQuote?: { token: string; addressId: string };
};

/** The reasons an order action can fail. The shop shows its own text for each (store.orderErrors in content/id.json). */
export type OrderErrorKind =
  | "notSignedIn"
  | "invalidItems"
  | "invalidAddress"
  | "invalidShipping"
  | "invalidTracking"
  | "notShippable"
  | "shippingQuoteChanged"
  | "shippingQuoteUnavailable"
  | "tooManyPending"
  | "productUnavailable"
  | "outOfStock"
  | "proofType"
  | "proofSize"
  | "proofUnreadable"
  | "orderNotFound"
  | "notPayable"
  | "invalidProof"
  | "notReviewable"
  | "reasonRequired"
  | "noteRequired"
  | "notCancellable"
  | "notRefundable"
  | "notReceivable"
  | "forbidden"
  | "network"
  | "unknown";

export type OrderError = {
  kind: OrderErrorKind;
  /** For productUnavailable and outOfStock: which product. */
  productId?: number;
};

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: OrderError };

export type PlacedOrder = {
  number: string;
  id?: string;
  /** False when the order exists but sending the proof failed; it can be sent again from "Pesanan saya". */
  proofSent: boolean;
  /** Why the proof was not sent, when it was not. */
  proofError?: OrderError;
};

/** What a transfer proof may be. The private bucket enforces the same types. */
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
/** The most a proof may weigh when it is stored (the private bucket enforces it). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
/**
 * The most a chosen photo may weigh before the browser shrinks it. A phone screenshot or camera photo is often several
 * MB; it is shrunk to WebP (a few hundred KB) before it is sent, so only the shrunk file has to fit MAX_PROOF_BYTES.
 * A PDF cannot be shrunk and is held to MAX_PROOF_BYTES as it is.
 */
export const MAX_PROOF_SOURCE_BYTES = 20 * 1024 * 1024;
