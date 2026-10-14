"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserAdminReviewServices, reviewsInDatabase, type AdminReviewServices } from "./lib/services";
import type { AdminReview } from "./lib/admin-review-repository";
import type { Write } from "./lib/buyer-review-repository";

// Every review, for the admin's moderation screen. In the database when the build has Supabase credentials (or a fake
// is given); otherwise `database` is false and the admin keeps working with the sample reviews.

export type AdminReviews = {
  database: boolean;
  reviews: AdminReview[];
  status: "loading" | "ready" | "error";
  reload: () => void;
  /** Hides a review from the shop, or shows it again, then reads the list again. */
  setHidden: (id: number, hidden: boolean) => Promise<Write<null>>;
  /** Deletes a review for good, then reads the list again. */
  remove: (id: number) => Promise<Write<null>>;
};

export function useAdminReviews(provided?: AdminReviewServices): AdminReviews {
  const database = provided !== undefined || reviewsInDatabase();
  const [services, setServices] = useState<AdminReviewServices | null>(provided ?? null);
  const [loaded, setLoaded] = useState<{ status: AdminReviews["status"]; reviews: AdminReview[] }>({ status: database ? "loading" : "ready", reviews: [] });

  useEffect(() => {
    if (database && !services) setServices(createBrowserAdminReviewServices());
  }, [database, services]);

  const reload = useCallback(async () => {
    if (!services) return;
    setLoaded((current) => ({ ...current, status: "loading" }));
    const result = await services.repo.listAll();
    setLoaded((current) => (result.ok ? { status: "ready", reviews: result.value } : { status: "error", reviews: current.reviews }));
  }, [services]);

  useEffect(() => {
    // Loading the reviews when the screens open is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  const setHidden = useCallback(
    async (id: number, hidden: boolean): Promise<Write<null>> => {
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.setHidden(id, hidden);
      if (result.ok) void reload();
      return result;
    },
    [reload, services],
  );

  const remove = useCallback(
    async (id: number): Promise<Write<null>> => {
      if (!services) return { ok: false, error: "unknown" };
      const result = await services.repo.remove(id);
      if (result.ok) void reload();
      return result;
    },
    [reload, services],
  );

  return { database, reviews: database ? loaded.reviews : [], status: database ? loaded.status : "ready", reload: () => void reload(), setHidden, remove };
}
