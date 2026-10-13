import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PHOTO_BUCKET } from "./photo-storage";
import { publicObjectUrl } from "./image-variants";
import { createStorefrontRepository, type StorefrontRepository } from "./storefront-repository";

/** Everything the storefront needs from the outside world, so tests can swap it. */
export type StorefrontServices = { repo: StorefrontRepository };

/**
 * True when the build has Supabase credentials, which is when the shop reads its products from the database. Without
 * them (the local demo) the shop keeps showing the sample products. Both variables are written out so Next.js can
 * inline them into the browser bundle.
 */
export const databaseConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export function createBrowserStorefrontServices(): StorefrontServices {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return { repo: createStorefrontRepository(getSupabaseBrowserClient(), (key) => publicObjectUrl(url, PHOTO_BUCKET, key)) };
}
