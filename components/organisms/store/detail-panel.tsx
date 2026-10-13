"use client";

import Link from "next/link";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { PRODUCT_REVIEWS } from "@/lib/mock/store";
import { StockBadge } from "../../atoms/badges";
import { ProductImage } from "../../atoms/product-image";
import { Button } from "../../atoms/button";
import { CloseButton } from "../../atoms/close-button";
import { RatingSummary, ReviewItem } from "../../molecules/review-summary";
import { useCatalog } from "@/features/catalog";
import { ProductReviewsLoader } from "@/features/reviews";
import { useUi } from "@/shared/ui-state/ui-provider";
import { useStore } from "../../providers/store-provider";

export function DetailPanel() {
  const { panels, closePanel } = useUi();
  const { selected: p, liked, toggleLike } = useCatalog();
  const { addToCart } = useStore();
  const isLiked = p ? liked.has(p.id) : false;

  return (
    <aside className={`detail${panels.detail ? " open" : ""}`} id="detail" aria-hidden={!panels.detail}>
      <div className="overlay" onClick={() => closePanel("detail")} />
      <div className="panel">
        <CloseButton label={t("common.close")} onClick={() => closePanel("detail")} />
        {p ? <ProductImage product={p} className="detail-photo" sizes="(max-width: 700px) 100vw, 640px" /> : <div className="detail-photo" />}
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
          {p?.slug && <Link className="detail-page-link" href={`/produk/${p.slug}`} onClick={() => closePanel("detail")}>{t("store.detail.openPage")}</Link>}
          {/* A database product shows its own reviews; the sample products keep the sample reviews below. While nothing
              is open the panel shows no reviews at all, so the sample ones never reach the page's HTML (and a search engine). */}
          {!p ? null : p.photos !== undefined ? (
            <ProductReviewsLoader key={p.id} productId={p.id} />
          ) : (
            <section className="review-block">
              <div className="review-title">
                <h3>{t("store.detail.reviewsTitle")}</h3>
                <span className="verified">{t("store.detail.verified")}</span>
              </div>
              <RatingSummary />
              {PRODUCT_REVIEWS.items.map((r) => <ReviewItem key={r.name} {...r} />)}
            </section>
          )}
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
