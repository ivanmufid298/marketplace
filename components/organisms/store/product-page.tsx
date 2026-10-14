"use client";

import { useCart } from "@/features/cart";
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/mock/store";
import { useCatalog } from "@/features/catalog";
import { ProductReviews, type ProductReviewsData } from "@/features/reviews";
import { StockBadge } from "../../atoms/badges";
import { Button } from "../../atoms/button";

/** The full page of one product: all its photos, the details, and the same cart and wishlist actions as the detail panel. */
export function ProductPage({ product: p, reviews }: { product: Product; reviews: ProductReviewsData }) {
  const { liked, toggleLike } = useCatalog();
  const { addToCart } = useCart();
  const photos = p.photos ?? [];
  const [current, setCurrent] = useState(0);
  const shown = photos[current] ?? photos[0];
  const soldOut = p.stock <= 0;
  const isLiked = liked.has(p.id);

  return (
    <main className="shell product-page">
      <Link className="product-page-back" href="/">{t("store.productPage.back")}</Link>
      <article className="product-page-grid">
        <div className="product-page-gallery">
          <div className="product-page-photo">
            {shown && (
              // eslint-disable-next-line @next/next/no-img-element -- already resized in the admin's browser
              <img src={shown.src} srcSet={shown.srcSet} sizes="(max-width: 820px) 100vw, 600px" alt={shown.alt || p.name} width={shown.width ?? undefined} height={shown.height ?? undefined} />
            )}
          </div>
          {photos.length > 1 && (
            <div className="product-page-thumbs">
              {photos.map((photo, index) => (
                <button
                  key={photo.src}
                  type="button"
                  className={index === current ? "active" : undefined}
                  aria-label={t("store.productPage.showPhoto", { number: index + 1 })}
                  aria-pressed={index === current}
                  onClick={() => setCurrent(index)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small, already resized */}
                  <img src={photo.src} srcSet={photo.srcSet} sizes="72px" alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-page-info">
          <span className="eyebrow">{p.cat}</span>
          <h1>{p.name}</h1>
          <div className="product-page-price">
            <strong>{money(p.price)}</strong>
            {p.oldPrice && <del>{money(p.oldPrice)}</del>}
            {p.promo && <span className="product-page-promo">{p.promo}</span>}
          </div>
          <StockBadge style={{ display: "inline-flex" }}>
            {soldOut ? t("store.productPage.soldOut") : p.stock <= 3 ? t("store.detail.stockLow", { stock: p.stock }) : t("store.detail.stockOk", { stock: p.stock })}
          </StockBadge>
          {p.desc && <p className="product-page-desc">{p.desc}</p>}
          <div className="detail-actions">
            <Button variant="secondary" onClick={() => toggleLike(p.id)}>{isLiked ? t("store.detail.wishlistRemove") : t("store.detail.wishlistAdd")}</Button>
            <Button disabled={soldOut} onClick={() => addToCart(p)}>{soldOut ? t("store.productPage.soldOutButton") : t("store.detail.addToCart")}</Button>
          </div>
        </div>

        <div className="product-page-reviews">
          <ProductReviews data={reviews} />
        </div>
      </article>
    </main>
  );
}
