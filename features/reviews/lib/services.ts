import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createAdminReviewRepository, type AdminReviewRepository } from "./admin-review-repository";
import { createBuyerReviewRepository, type BuyerReviewRepository } from "./buyer-review-repository";

/** What the buyer's "Pesanan saya" needs to write and read their own reviews. */
export type BuyerReviewServices = { repo: Pick<BuyerReviewRepository, "submitReview" | "listMyReviews"> };
/** What the admin's moderation screen needs. */
export type AdminReviewServices = { repo: Pick<AdminReviewRepository, "listAll" | "setHidden"> };

/** True when the build has Supabase credentials, i.e. reviews live in the database. */
export const reviewsInDatabase = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

export const createBrowserBuyerReviewServices = (): BuyerReviewServices => ({ repo: createBuyerReviewRepository(getSupabaseBrowserClient()) });
export const createBrowserAdminReviewServices = (): AdminReviewServices => ({ repo: createAdminReviewRepository(getSupabaseBrowserClient()) });
