import type { SupabaseClient } from "@supabase/supabase-js";
import type { Write } from "./buyer-review-repository";
import { mapReviewWriteError } from "./write-errors";

// The reviews of every product, for the admin's moderation screen. Hiding one takes it off the product page and out of
// the product's score without deleting it. (An admin's session can read and change every review; nobody else can.)

export type AdminReviewsDb = Pick<SupabaseClient, "from">;

export type AdminReview = {
  id: number;
  buyer: string;
  product: string;
  rating: number;
  text: string;
  /** True when it comes from a completed order. */
  verified: boolean;
  hidden: boolean;
  createdAt: string;
};

type Row = {
  id: number;
  author_name: string;
  rating: number;
  body: string;
  is_verified: boolean;
  status: "published" | "hidden";
  created_at: string;
  products?: { name: string } | { name: string }[] | null;
};

export function toAdminReview(row: Row): AdminReview {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    id: row.id,
    buyer: row.author_name,
    product: product?.name ?? "",
    rating: row.rating,
    text: row.body,
    verified: row.is_verified,
    hidden: row.status === "hidden",
    createdAt: row.created_at,
  };
}

export function createAdminReviewRepository(db: AdminReviewsDb) {
  return {
    async listAll(): Promise<Write<AdminReview[]>> {
      const { data, error } = await db
        .from("product_reviews")
        .select("id, author_name, rating, body, is_verified, status, created_at, products(name)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) return { ok: false, error: mapReviewWriteError(error) };
      return { ok: true, value: ((data ?? []) as unknown as Row[]).map(toAdminReview) };
    },

    /** Hides a review from the shop, or shows it again. */
    async setHidden(id: number, hidden: boolean): Promise<Write<null>> {
      const { data, error } = await db.from("product_reviews").update({ status: hidden ? "hidden" : "published" }).eq("id", id).select("id");
      if (error) return { ok: false, error: mapReviewWriteError(error) };
      // Row Level Security hides rows without an error, so "nothing was changed" has to be checked.
      return (data as unknown[] | null)?.length ? { ok: true, value: null } : { ok: false, error: "forbidden" };
    },
  };
}

export type AdminReviewRepository = ReturnType<typeof createAdminReviewRepository>;
