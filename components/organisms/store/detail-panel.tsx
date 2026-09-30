"use client";

import { money, spritePosition } from "@/lib/format";
import { t } from "@/lib/i18n";
import { PRODUCT_REVIEWS } from "@/lib/mock/store";
import { StockBadge } from "../../atoms/badges";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { RatingSummary, ReviewItem } from "../../molecules/review-summary";
import { useStore } from "../../providers/store-provider";

export function DetailPanel() {
  const { panels, closePanel, selected: p, liked, toggleLike, addToCart } = useStore();
  const isLiked = p ? liked.has(p.id) : false;

  return (
    <aside className={`detail${panels.detail ? " open" : ""}`} id="detail" aria-hidden={!panels.detail}>
      <div className="overlay" onClick={() => closePanel("detail")} />
      <div className="panel">
        <CloseButton label={t("common.close")} onClick={() => closePanel("detail")} />
        <div className="detail-photo" style={{ backgroundPosition: p ? spritePosition(p.pos) : undefined }} />
        <div className="detail-body">
          <span className="eyebrow">{p?.cat}</span>
          <h2>{p?.name}</h2>
          <div className="detail-price">{p ? money(p.price) : ""}</div>
          {p && (
            <StockBadge style={{ display: "inline-flex" }}>
              {p.stock <= 3 ? t("store.detail.stockLow", { stock: p.stock }) : t("store.detail.stockOk", { stock: p.stock })}
            </StockBadge>
          )}
          <p className="detail-desc">{p?.desc}</p>
          <section className="review-block">
            <div className="review-title">
              <h3>{t("store.detail.reviewsTitle")}</h3>
              <span className="verified">{t("store.detail.verified")}</span>
            </div>
            <RatingSummary />
            {PRODUCT_REVIEWS.items.map((r) => <ReviewItem key={r.name} {...r} />)}
          </section>
          <div className="detail-actions">
            <Button variant="secondary" onClick={() => p && toggleLike(p.id)}>
              {isLiked ? t("store.detail.wishlistRemove") : t("store.detail.wishlistAdd")}
            </Button>
            <Button onClick={() => p && addToCart(p)}>{t("store.detail.addToCart")}</Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
