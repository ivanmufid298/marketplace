import { t } from "@/lib/i18n";
import { RatingSummary, ReviewItem } from "@/components/molecules/review-summary";
import { timeAgo, type Ago } from "../lib/relative-time";
import { toRatingSummary } from "../lib/summary";
import type { ProductReviews as ProductReviewsData } from "../lib/types";

const agoText = ({ unit, n }: Ago) => t(`store.reviews.ago.${unit}`, { n });

/** The review section of a product: the score and bars, then the newest reviews, or an honest note when there are none. */
export function ProductReviews({ data }: { data: ProductReviewsData }) {
  const { stats, reviews } = data;
  return (
    <section className="review-block">
      <div className="review-title">
        <h3>{t("store.detail.reviewsTitle")}</h3>
      </div>
      {stats.count === 0 ? (
        <p className="reviews-note">{t("store.reviews.empty")}</p>
      ) : (
        <>
          <RatingSummary summary={toRatingSummary(stats)} />
          {reviews.map((r) => (
            <ReviewItem key={r.id} name={r.author} rating={r.rating} when={agoText(timeAgo(r.createdAt))} text={r.body} verified={r.verified} />
          ))}
          {stats.count > reviews.length && <p className="reviews-note">{t("store.reviews.showing", { shown: reviews.length, count: stats.count })}</p>}
        </>
      )}
    </section>
  );
}
