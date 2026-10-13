import { t } from "@/lib/i18n";
import { PRODUCT_REVIEWS } from "@/lib/mock/store";

export const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

/** Average score plus per-star distribution bars. */
export function RatingSummary({ summary = PRODUCT_REVIEWS }: { summary?: Pick<typeof PRODUCT_REVIEWS, "score" | "count" | "bars"> }) {
  return (
    <div className="review-score">
      <div>
        <div className="score-big">{summary.score}</div>
        <div className="stars">★★★★★</div>
        <small style={{ color: "var(--muted)" }}>{t("store.detail.reviewCount", { count: summary.count })}</small>
      </div>
      <div className="review-bars">
        {summary.bars.map(({ star, pct }) => (
          <div className="review-bar" key={star}>
            <span>{star}</span>
            <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${pct}%` }} /></span>
            <span>{pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ReviewItemProps = { name: string; rating: number; when: string; text: string; verified?: boolean };

export function ReviewItem({ name, rating, when, text, verified = false }: ReviewItemProps) {
  return (
    <article className="review-item">
      <div className="reviewer">
        <div><b>{name}</b><div className="stars">{stars(rating)}</div></div>
        {/* The relative time can differ by a moment between the server render and the browser. */}
        <span className="sub" suppressHydrationWarning>{when}</span>
      </div>
      <p>{text}</p>
      {verified && <span className="review-verified">{t("store.reviews.verified")}</span>}
    </article>
  );
}
