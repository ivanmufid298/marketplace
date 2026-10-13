import { createClient } from "@supabase/supabase-js";
import type { Product } from "@/lib/mock/store";
import { publicObjectUrl } from "./image-variants";
import { PHOTO_BUCKET } from "./photo-storage";
import { createStorefrontRepository, type SitemapEntry } from "./storefront-repository";

// Reading the shop from the server, for product pages and the sitemap. It uses the public (anon) key and no cookies,
// so what it returns is exactly what an anonymous visitor may see: Row Level Security does the hiding, and the
// queries also ask for active products by name. Never throws; a missing setting or a failed read looks like "nothing".

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function repository() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return createStorefrontRepository(client, (objectKey) => publicObjectUrl(url, PHOTO_BUCKET, objectKey));
}

/** The product on sale at this address, or null when there is none (or the shop has no database). */
export async function getStoreProductBySlug(slug: string): Promise<Product | null> {
  // An address that could not exist is not worth a database call.
  if (!SLUG.test(slug) || slug.length > 80) return null;
  const repo = repository();
  if (!repo) return null;
  const result = await repo.getBySlug(slug);
  return result.ok ? result.value : null;
}

/** Product pages to list for search engines. */
export async function listStoreSitemapEntries(): Promise<SitemapEntry[]> {
  const repo = repository();
  if (!repo) return [];
  const result = await repo.listSitemapEntries();
  return result.ok ? result.value : [];
}
