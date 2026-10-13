import { formatDate } from "@/lib/format";
import type { Order, OrderItem, PaymentState } from "@/lib/mock/orders";
import type { ProductPhoto } from "@/lib/mock/store";

// Turns a row of the orders table (with its items) into the shape the shop screens already use.

export type OrderItemRow = { product_id: number | null; product_name: string; product_slug: string | null; image_key: string | null; unit_price: number; quantity: number };
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
  cancel_note: string | null;
  refund_status: "pending" | "done" | null;
  created_at: string;
  order_items?: OrderItemRow[] | null;
};

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
  const timedOut = row.payment_status === "awaiting_payment" && new Date(row.expires_at).getTime() <= now;
  const expired = row.payment_status === "expired" || timedOut;
  const awaitingProof = row.payment_status === "awaiting_payment" && !timedOut;

  const items: OrderItem[] = (row.order_items ?? []).map((item) => ({
    productId: item.product_id ?? 0,
    qty: item.quantity,
    price: item.unit_price,
    name: item.product_name,
    ...(item.product_slug ? { slug: item.product_slug } : {}),
    photos: item.image_key ? [photoFor(item.image_key, item.product_name)] : [],
  }));

  return {
    id: row.id,
    number: row.number,
    buyerId,
    buyer: row.recipient_name,
    phone: row.phone,
    address: [row.address, row.city, row.postcode].filter(Boolean).join(", "),
    date: formatDate(new Date(row.created_at)),
    items,
    shippingMethod: row.shipping_label,
    shippingFee: row.shipping_fee,
    payment: PAYMENT[row.payment_status],
    received: row.received_at !== null,
    history: [],
    ...(awaitingProof ? { awaitingProof: true, payBefore: row.expires_at } : {}),
    ...(expired ? { expired: true } : {}),
    ...(row.cancel_note !== null ? { cancelNote: row.cancel_note } : {}),
    ...(row.refund_status ? { refund: row.refund_status } : {}),
  };
}
