import type { SupabaseClient } from "@supabase/supabase-js";
import type { Order } from "@/lib/mock/orders";
import type { ProductPhoto } from "@/lib/mock/store";
import { mapOrderError } from "./errors";
import { toOrder, type OrderRow } from "./map-order";
import { ProofPrepareError } from "./prepare-proof";
import { MAX_PROOF_BYTES, MAX_PROOF_SOURCE_BYTES, PROOF_TYPES, type OrderError, type Outcome, type PlaceOrderInput, type PlacedOrder, type ShippingMethod } from "./types";

// Everything the shop does with orders in the database: list the shipping methods, place an order, send the transfer
// proof, and read the buyer's own orders. The database decides prices, fees, and stock (place_order); this code only
// carries the request there and reports what came back.

/** Only `from` and `rpc` are used, so a fake can stand in for the client in tests. */
export type OrdersDb = Pick<SupabaseClient, "from" | "rpc">;

/** Where transfer proofs are stored (the private payment-proofs bucket). */
export type ProofStorage = {
  upload(path: string, file: File, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** A link that opens a private proof for a short while (the admin checks proofs through it). */
  signedUrl(path: string, seconds: number): Promise<string>;
};

/** How long an admin's link to a proof works. */
export const PROOF_LINK_SECONDS = 60;

export type OrderRepositoryDeps = {
  db: OrdersDb;
  storage: ProofStorage;
  /** The display-ready photo for a stored photo key. */
  photoFor: (imageKey: string, alt: string) => ProductPhoto;
  /** A fresh random id for a file name. */
  newId: () => string;
  /** The current time, for deciding whether an unpaid order is out of time. */
  now?: () => number;
  /** Turns the chosen proof into the file that is uploaded (shrunk to WebP). The default sends it as it is. */
  prepare?: (file: File) => Promise<File>;
};

const ORDER_COLUMNS =
  "id, number, recipient_name, phone, address, city, postcode, shipping_label, shipping_fee, payment_status, expires_at, payment_rejection_reason, reupload_until, received_at, cancel_note, refund_status, created_at, order_items(id, product_id, product_name, product_slug, image_key, unit_price, quantity)";

const ADMIN_COLUMNS = `${ORDER_COLUMNS}, buyer_id, order_status_history(event, actor_name, note, created_at), payment_proofs(object_key, mime_type, size_bytes, created_at)`;

const EXTENSION: Record<(typeof PROOF_TYPES)[number], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const ok = <T,>(value: T): Outcome<T> => ({ ok: true, value });
const fail = <T,>(error: OrderError): Outcome<T> => ({ ok: false, error });

/**
 * Checks a chosen proof file before anything is sent, so a bad file never costs the buyer an order. A photo may be big
 * (it is shrunk before it is sent); a PDF has to fit as it is.
 */
export function checkProof(file: { type: string; size: number }): "proofType" | "proofSize" | null {
  if (!(PROOF_TYPES as readonly string[]).includes(file.type)) return "proofType";
  const limit = file.type === "application/pdf" ? MAX_PROOF_BYTES : MAX_PROOF_SOURCE_BYTES;
  if (file.size < 1 || file.size > limit) return "proofSize";
  return null;
}

export function createOrderRepository({ db, storage, photoFor, newId, now = Date.now, prepare = async (file) => file }: OrderRepositoryDeps) {
  async function listShippingMethods(): Promise<Outcome<ShippingMethod[]>> {
    const { data, error } = await db.from("shipping_methods").select("code, label, note, fee").order("sort_order", { ascending: true }).order("code", { ascending: true });
    if (error) return fail(mapOrderError(error));
    return ok(((data ?? []) as { code: string; label: string; note: string; fee: number }[]).map((m) => ({ value: m.code, label: m.label, note: m.note, cost: m.fee })));
  }

  /** The file to upload for a chosen proof: checked, shrunk, and checked again. Nothing is sent yet. */
  async function prepared(file: File): Promise<Outcome<File>> {
    const problem = checkProof(file);
    if (problem) return fail({ kind: problem });
    let result: File;
    try {
      result = await prepare(file);
    } catch (error) {
      return fail({ kind: error instanceof ProofPrepareError ? error.reason : "proofUnreadable" });
    }
    // What is stored is what the database limits: a shrunk photo is far below it; a PDF or an unshrinkable photo may not be.
    if (result.size < 1 || result.size > MAX_PROOF_BYTES) return fail({ kind: "proofSize" });
    if (!(PROOF_TYPES as readonly string[]).includes(result.type)) return fail({ kind: "proofType" });
    return ok(result);
  }

  /** Sends one proof file, already prepared, to an order: upload, then tell the database. A refused record removes the file again. */
  async function uploadProof(orderId: string, file: File): Promise<Outcome<null>> {
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

  /** Runs one of the order action functions and reports whether the database allowed it. */
  async function action(name: string, args: Record<string, unknown>): Promise<Outcome<null>> {
    const { error } = await db.rpc(name, args);
    return error ? fail(mapOrderError(error)) : ok(null);
  }

  /** Sends a chosen proof: shrinks it, uploads it, and tells the database. */
  async function sendProof(orderId: string, chosen: File): Promise<Outcome<null>> {
    const file = await prepared(chosen);
    return file.ok ? uploadProof(orderId, file.value) : fail(file.error);
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
      // The proof is made ready first, so a file that cannot be used never takes stock.
      let proof: File | null = null;
      if (input.proof) {
        const ready = await prepared(input.proof);
        if (!ready.ok) return fail(ready.error);
        proof = ready.value;
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
      if (!proof) return ok({ number: placed.number, id: placed.id, proofSent: false });

      const sent = await uploadProof(placed.id, proof);
      return ok(sent.ok ? { number: placed.number, id: placed.id, proofSent: true } : { number: placed.number, id: placed.id, proofSent: false, proofError: sent.error });
    },

    /** The buyer taps "Pesanan selesai": the database only allows it for their own paid order. */
    confirmReceived: (orderId: string) => action("confirm_received", { p_order_id: orderId }),

    /** An admin accepts the transfer proof of an order under review. */
    acceptPayment: (orderId: string) => action("accept_payment", { p_order_id: orderId }),

    /** An admin rejects the proof with a reason; the buyer has two hours to send a new one. */
    rejectPayment: (orderId: string, reason: string) => action("reject_payment", { p_order_id: orderId, p_reason: reason }),

    /** An admin cancels an order with a reason. A paid order goes to refund; an unpaid one gets its stock back. */
    cancelOrder: (orderId: string, note: string) => action("cancel_order", { p_order_id: orderId, p_note: note }),

    /** An admin records that the refund was paid. */
    markRefunded: (orderId: string) => action("mark_refunded", { p_order_id: orderId }),

    /** A short-lived link to open a private proof. Only an admin or the order's buyer is allowed one. */
    async proofLink(objectKey: string): Promise<Outcome<string>> {
      try {
        return ok(await storage.signedUrl(objectKey, PROOF_LINK_SECONDS));
      } catch (error) {
        return fail(mapOrderError(error as { message?: string }));
      }
    },

    /** Every order with its history and proofs, newest first, for the admin screens. (An admin's session can read them all.) */
    async listAllOrders(): Promise<Outcome<Order[]>> {
      const { data, error } = await db.from("orders").select(ADMIN_COLUMNS).order("created_at", { ascending: false }).order("number", { ascending: false });
      if (error) return fail(mapOrderError(error));
      const at = now();
      return ok(((data ?? []) as unknown as (OrderRow & { buyer_id?: string | null })[]).map((row) => toOrder(row, row.buyer_id ?? "", photoFor, at)));
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
