// Public API of the orders module: the signed-in buyer's orders, checkout, and sending transfer proof. In the database
// when the build has Supabase credentials, in this browser (the sample store) otherwise.

export { OrdersProvider, useBuyerOrders, type OrdersStatus } from "./orders-provider";
export type { OrderServices } from "./lib/services";
export { mapOrderError } from "./lib/errors";
export { checkProof } from "./lib/order-repository";
export { MAX_PROOF_BYTES, PROOF_TYPES, type OrderError, type OrderErrorKind, type Outcome, type PlaceOrderInput, type PlacedOrder, type ShippingMethod } from "./lib/types";
