import { formatDateTime } from "@/lib/format";
import type { HistoryEntry, HistoryEvent, Order, OrderItem, OrderProof, PaymentState } from "@/lib/mock/orders";
import type { ProductPhoto } from "@/lib/mock/store";

// Turns a row of the orders table (with its items) into the shape the shop screens already use.

export type OrderItemRow = { id?: number; product_id: number | null; product_name: string; product_slug: string | null; image_key: string | null; unit_price: number; quantity: number };
export type OrderRow = {
  id: string;
  number: string;
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  shipping_label: string;
  shipping_fee: number;
  payment_status: "awaiting_payment" | "under_review" | "paid" | "rejected" | "expired";
  expires_at: string;
  received_at: string | null;
  tracking_number?: string | null;
  cancel_note: string | null;
  refund_status: "pending" | "done" | null;
  created_at: string;
  payment_rejection_reason?: string | null;
  reupload_until?: string | null;
  order_items?: OrderItemRow[] | null;
  /** Loaded for the admin only. */
  order_status_history?: { event: string; actor_name: string; note: string | null; created_at: string }[] | null;
  payment_proofs?: { object_key: string; mime_type: string; size_bytes: number; created_at: string }[] | null;
};

const formatDate = (iso: string) => formatDateTime(new Date(iso)).split(",")[0];

const PAYMENT: Record<OrderRow["payment_status"], PaymentState> = {
  awaiting_payment: "pending",
  under_review: "pending",
  paid: "success",
  rejected: "failed",
  expired: "pending",
};

/**
 * @param photoFor the display-ready photo of a stored photo key (the catalog knows where photos live).
 * @param now an unpaid order past its deadline counts as expired even before the database job has marked it.
 */
export function toOrder(row: OrderRow, buyerId: string, photoFor: (imageKey: string, alt: string) => ProductPhoto, now: number = Date.now()): Order {
  const deadline = row.payment_status === "rejected" ? row.reupload_until ?? null : row.expires_at;
  const timedOut = (row.payment_status === "awaiting_payment" || row.payment_status === "rejected") && deadline !== null && new Date(deadline).getTime() <= now;
  const expired = row.payment_status === "expired" || timedOut;
  const awaitingProof = row.payment_status === "awaiting_payment" && !timedOut;
  // The buyer may send proof before the first one, and again after a rejection until its window closes.
  const canSendProof = (row.payment_status === "awaiting_payment" || row.payment_status === "rejected") && !timedOut && deadline !== null;

  const items: OrderItem[] = (row.order_items ?? []).map((item) => ({
    ...(item.id !== undefined ? { itemId: item.id } : {}),
    productId: item.product_id ?? 0,
    qty: item.quantity,
    price: item.unit_price,
    name: item.product_name,
    ...(item.product_slug ? { slug: item.product_slug } : {}),
    photos: item.image_key ? [photoFor(item.image_key, item.product_name)] : [],
  }));

  const history: HistoryEntry[] = [...(row.order_status_history ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((h) => ({ at: formatDateTime(new Date(h.created_at)), event: h.event as HistoryEvent, actor: h.actor_name, ...(h.note ? { note: h.note } : {}) }));
  const proofs: OrderProof[] | undefined = row.payment_proofs
    ? [...row.payment_proofs].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((p) => ({ objectKey: p.object_key, mime: p.mime_type, size: p.size_bytes, at: formatDateTime(new Date(p.created_at)) }))
    : undefined;

  return {
    id: row.id,
    number: row.number,
    buyerId,
    buyer: row.recipient_name,
    phone: row.phone,
    address: [row.address, row.city, row.postcode].filter(Boolean).join(", "),
    date: formatDate(row.created_at),
    items,
    shippingMethod: row.shipping_label,
    shippingFee: row.shipping_fee,
    payment: PAYMENT[row.payment_status],
    received: row.received_at !== null,
    history,
    ...(awaitingProof ? { awaitingProof: true } : {}),
    ...(canSendProof ? { canSendProof: true, payBefore: deadline as string } : {}),
    ...(row.payment_status === "rejected" && row.payment_rejection_reason ? { rejectionReason: row.payment_rejection_reason } : {}),
    ...(expired ? { expired: true } : {}),
    ...(row.tracking_number ? { tracking: row.tracking_number } : {}),
    ...(row.cancel_note !== null ? { cancelNote: row.cancel_note } : {}),
    ...(row.refund_status ? { refund: row.refund_status } : {}),
    ...(proofs ? { proofs } : {}),
  };
}
