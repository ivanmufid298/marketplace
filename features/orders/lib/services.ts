import { buildSrcSet, PHOTO_BUCKET, publicObjectUrl, variantKey } from "@/features/catalog";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createOrderRepository, type OrderRepository } from "./order-repository";
import { createSupabaseProofStorage } from "./proof-storage";

/** Everything the orders provider needs from the outside world, so tests can swap it. */
export type OrderServices = { repo: Pick<OrderRepository, "listShippingMethods" | "placeOrder" | "sendProof" | "listMyOrders"> };

/** The real thing: Supabase from the browser, with the signed-in buyer's session. */
export function createBrowserOrderServices(): OrderServices {
  const client = getSupabaseBrowserClient();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const urlFor = (key: string) => publicObjectUrl(base, PHOTO_BUCKET, key);
  return {
    repo: createOrderRepository({
      db: client,
      storage: createSupabaseProofStorage(client),
      photoFor: (imageKey, alt) => ({ src: urlFor(variantKey(imageKey, 400)), srcSet: buildSrcSet((w) => urlFor(variantKey(imageKey, w))), alt, width: null, height: null }),
      newId: () => crypto.randomUUID(),
    }),
  };
}
