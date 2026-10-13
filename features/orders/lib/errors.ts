import type { OrderError } from "./types";

// The order functions in the database fail with a short code as the error message (see the orders migration), and
// the browser's connection can fail with no code at all. This turns both into one small set of reasons.

export type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null };

const BY_MESSAGE: Record<string, OrderError["kind"]> = {
  not_signed_in: "notSignedIn",
  invalid_items: "invalidItems",
  invalid_address: "invalidAddress",
  invalid_shipping: "invalidShipping",
  too_many_pending: "tooManyPending",
  product_unavailable: "productUnavailable",
  out_of_stock: "outOfStock",
  order_not_found: "orderNotFound",
  not_payable: "notPayable",
  invalid_proof: "invalidProof",
  not_reviewable: "notReviewable",
  reason_required: "reasonRequired",
  note_required: "noteRequired",
  not_cancellable: "notCancellable",
  not_refundable: "notRefundable",
  not_receivable: "notReceivable",
  forbidden: "forbidden",
};

export function mapOrderError(error: DbErrorLike | null | undefined): OrderError {
  if (!error) return { kind: "unknown" };
  const message = (error.message ?? "").trim();

  // A request that never reached the server has no Postgres code.
  if (!error.code && /failed to fetch|network|load failed|fetch failed/i.test(message)) return { kind: "network" };
  if (error.code === "28000") return { kind: "notSignedIn" };

  const kind = BY_MESSAGE[message];
  if (kind) {
    const productId = Number(error.details);
    return (kind === "outOfStock" || kind === "productUnavailable") && Number.isInteger(productId) && productId > 0 ? { kind, productId } : { kind };
  }

  if (error.code === "42501" || /row-level security|permission denied/i.test(message)) return { kind: "forbidden" };
  return { kind: "unknown" };
}
