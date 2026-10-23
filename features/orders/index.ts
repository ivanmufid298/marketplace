// Public API of the orders module: the signed-in buyer's orders, checkout, and sending transfer proof. In the database
// when the build has Supabase credentials, in this browser (the sample store) otherwise.

export { OrdersProvider, useBuyerOrders, type OrdersStatus } from "./orders-provider";
export { useAdminOrders, type AdminOrders } from "./admin-orders";
export type { AdminOrderServices, OrderServices } from "./lib/services";
export { useOrderErrorText } from "./use-order-error-text";
export { mapOrderError } from "./lib/errors";
export { cleanTracking, TRACKING_PATTERN } from "./lib/tracking";
export { checkProof } from "./lib/order-repository";
export { MAX_PROOF_BYTES, MAX_PROOF_SOURCE_BYTES, PROOF_TYPES, type OrderError, type OrderErrorKind, type Outcome, type PlaceOrderInput, type PlacedOrder, type ShippingMethod } from "./lib/types";
