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
};

/** The reasons an order action can fail. The shop shows its own text for each (store.orderErrors in content/id.json). */
export type OrderErrorKind =
  | "notSignedIn"
  | "invalidItems"
  | "invalidAddress"
  | "invalidShipping"
  | "tooManyPending"
  | "productUnavailable"
  | "outOfStock"
  | "proofType"
  | "proofSize"
  | "orderNotFound"
  | "notPayable"
  | "invalidProof"
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

/** What a transfer proof may be. The private bucket enforces the same limits. */
export const PROOF_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
