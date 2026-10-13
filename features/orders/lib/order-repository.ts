import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/mock/orders";
import type { ProductPhoto } from "@/lib/mock/store";
import { mapOrderError } from "./errors";
import { toOrder, type OrderRow } from "./map-order";
import { MAX_PROOF_BYTES, PROOF_TYPES, type OrderError, type Outcome, type PlaceOrderInput, type PlacedOrder, type ShippingMethod } from "./types";

// Everything the shop does with orders in the database: list the shipping methods, place an order, send the transfer
// proof, and read the buyer's own orders. The database decides prices, fees, and stock (place_order); this code only
// carries the request there and reports what came back.

/** Only `from` and `rpc` are used, so a fake can stand in for the client in tests. */
export type OrdersDb = Pick<SupabaseClient, "from" | "rpc">;

/** Where transfer proofs are stored (the private payment-proofs bucket). */
export type ProofStorage = {
  upload(path: string, file: File, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type OrderRepositoryDeps = {
  db: OrdersDb;
  storage: ProofStorage;
  /** The display-ready photo for a stored photo key. */
  photoFor: (imageKey: string, alt: string) => ProductPhoto;
  /** A fresh random id for a file name. */
  newId: () => string;
  /** The current time, for deciding whether an unpaid order is out of time. */
  now?: () => number;
};

const ORDER_COLUMNS =
  "id, number, recipient_name, phone, address, city, postcode, shipping_label, shipping_fee, payment_status, expires_at, received_at, cancel_note, refund_status, created_at, order_items(product_id, product_name, product_slug, image_key, unit_price, quantity)";

const EXTENSION: Record<(typeof PROOF_TYPES)[number], string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const ok = <T,>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T,>(error: OrderError): Outcome<T> => ({ ok: false, error });

/** Checks a chosen proof file before anything is sent, so a bad file never costs the buyer an order. */
export function checkProof(file: { type: string; size: number }): "proofType" | "proofSize" | null {
  if (!(PROOF_TYPES as readonly string[]).includes(file.type)) return "proofType";
  if (file.size < 1 || file.size > MAX_PROOF_BYTES) return "proofSize";
  return null;
}

export function createOrderRepository({ db, storage, photoFor, newId, now = Date.now }: OrderRepositoryDeps) {
  async function listShippingMethods(): Promise<Outcome<ShippingMethod[]>> {
    const { data, error } = await db.from("shipping_methods").select("code, label, note, fee").order("sort_order", { ascending: true }).order("code", { ascending: true });
    if (error) return fail(mapOrderError(error));
    return ok(((data ?? []) as { code: string; label: string; note: string; fee: number }[]).map((m) => ({ value: m.code, label: m.label, note: m.note, cost: m.fee })));
  }

  /** Uploads the proof file, then tells the database about it. A file whose record was refused is removed again. */
  async function sendProof(orderId: string, file: File): Promise<Outcome<null>> {
    const problem = checkProof(file);
    if (problem) return fail({ kind: problem });
    const path = `orders/${orderId}/${newId()}.${EXTENSION[file.type as (typeof PROOF_TYPES)[number]]}`;
    try {
      await storage.upload(path, file, file.type);
    } catch (error) {
      return fail(mapOrderError(error as { message?: string }));
    }
    const { error } = await db.rpc("submit_payment_proof", { p_order_id: orderId, p_object_key: path, p_mime_type: file.type, p_size_bytes: file.size });
    if (error) {
      // The file is useless without its record; leave nothing behind (best effort).
      await storage.remove(path).catch(() => {});
      return fail(mapOrderError(error));
    }
    return ok(null);
  }

  return {
    listShippingMethods,
    sendProof,

    /**
     * Places the order, then sends the proof. The proof is checked first, so a file the database would refuse never
     * takes stock. If the order is placed but the proof cannot be sent, that is reported on the result and not as a
     * failure: the order exists and the proof can be sent again from "Pesanan saya".
     */
    async placeOrder(input: PlaceOrderInput): Promise<Outcome<PlacedOrder>> {
      if (input.proof) {
        const problem = checkProof(input.proof);
        if (problem) return fail({ kind: problem });
      }
      const { data, error } = await db.rpc("place_order", {
        p_items: input.items.map((i) => ({ product_id: i.productId, quantity: i.qty })),
        p_shipping_code: input.shippingCode,
        p_recipient_name: input.recipient,
        p_phone: input.phone,
        p_address: input.address,
        p_city: input.city,
        p_postcode: input.postcode,
      });
      if (error) return fail(mapOrderError(error));

      const placed = data as { id: string; number: string } | null;
      if (!placed?.id || !placed.number) return fail({ kind: "unknown" });
      if (!input.proof) return ok({ number: placed.number, id: placed.id, proofSent: false });

      const proof = await sendProof(placed.id, input.proof);
      return ok(proof.ok ? { number: placed.number, id: placed.id, proofSent: true } : { number: placed.number, id: placed.id, proofSent: false, proofError: proof.error });
    },

    /** The signed-in buyer's own orders, newest first. (The database already limits the rows to them.) */
    async listMyOrders(buyerId: string): Promise<Outcome<Order[]>> {
      const { data, error } = await db.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false }).order("number", { ascending: false });
      if (error) return fail(mapOrderError(error));
      const at = now();
      return ok(((data ?? []) as unknown as OrderRow[]).map((row) => toOrder(row, buyerId, photoFor, at)));
    },
  };
}

export type OrderRepository = ReturnType<typeof createOrderRepository>;
