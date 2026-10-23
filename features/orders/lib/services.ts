import { buildSrcSet, PHOTO_BUCKET, publicObjectUrl, variantKey } from "@/features/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createOrderRepository, type OrderRepository } from "./order-repository";
import { prepareProof } from "./prepare-proof";
import { createSupabaseProofStorage } from "./proof-storage";

/** Everything the orders provider needs from the outside world, so tests can swap it. */
export type OrderServices = { repo: Pick<OrderRepository, "listShippingMethods" | "placeOrder" | "sendProof" | "listMyOrders" | "confirmReceived"> };

/** What the admin screens need: every order, the actions on it, and a link to a proof. */
export type AdminOrderServices = { repo: Pick<OrderRepository, "listAllOrders" | "acceptPayment" | "rejectPayment" | "cancelOrder" | "markRefunded" | "setTrackingNumber" | "proofLink"> };

function createBrowserRepository(): OrderRepository {
  const client = getSupabaseBrowserClient();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const urlFor = (key: string) => publicObjectUrl(base, PHOTO_BUCKET, key);
  return createOrderRepository({
    db: client,
    storage: createSupabaseProofStorage(client),
    photoFor: (imageKey, alt) => ({ src: urlFor(variantKey(imageKey, 400)), srcSet: buildSrcSet((w) => urlFor(variantKey(imageKey, w))), alt, width: null, height: null }),
    newId: () => crypto.randomUUID(),
    prepare: prepareProof,
  });
}

/** The real thing: Supabase from the browser, with the signed-in buyer's session. */
export const createBrowserOrderServices = (): OrderServices => ({ repo: createBrowserRepository() });

/** The same, for the admin screens, with the signed-in admin's session. */
export const createBrowserAdminOrderServices = (): AdminOrderServices => ({ repo: createBrowserRepository() });
