"use client";

import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createReviewRepository, type ReviewRepository } from "../lib/review-repository";
import type { ProductReviews as ProductReviewsData } from "../lib/types";
import { ProductReviews } from "./product-reviews";

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: ProductReviewsData };

type LoaderProps = {
  productId: number;
  /** Tests pass a fake; the real panel leaves this out and reads through the browser's Supabase client. */
  repository?: Pick<ReviewRepository, "getProductReviews">;
};

/** Loads a product's reviews in the browser (the detail panel has no server render) and shows them. */
export function ProductReviewsLoader({ productId, repository }: LoaderProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    const repo = repository ?? createReviewRepository(getSupabaseBrowserClient());
    setState({ status: "loading" });
    void repo.getProductReviews(productId).then((result) => {
      // A slower answer for a product the shopper has already left must not replace the newer one.
      if (current) setState(result.ok ? { status: "ready", data: result.value } : { status: "error" });
    });
    return () => {
      current = false;
    };
  }, [productId, repository, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (state.status === "ready") return <ProductReviews data={state.data} />;
  return (
    <section className="review-block">
      <div className="review-title">
        <h3>{t("store.detail.reviewsTitle")}</h3>
      </div>
      {state.status === "loading" ? (
        <p className="reviews-note" role="status">{t("store.reviews.loading")}</p>
      ) : (
        <p className="reviews-note" role="alert">
          {t("store.reviews.loadError")} <button type="button" className="link-btn" onClick={retry}>{t("store.reviews.retry")}</button>
        </p>
      )}
    </section>
  );
}
