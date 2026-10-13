import { createClient } from "@supabase/supabase-js";
import { createReviewRepository, type ReviewsDb } from "./review-repository";
import { NO_REVIEWS, type ProductReviews } from "./types";

// Reading reviews from the server, for the product page. It uses the public (anon) key and no cookies, so it returns
// what an anonymous visitor may see. It never throws: a missing setting or a failed read looks like "no reviews".

/** The reviews of a product, or none when the shop has no database or the read fails. */
export async function getProductReviews(productId: number, db?: ReviewsDb): Promise<ProductReviews> {
  let client = db;
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return NO_REVIEWS;
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  const result = await createReviewRepository(client).getProductReviews(productId);
  return result.ok ? result.value : NO_REVIEWS;
}
