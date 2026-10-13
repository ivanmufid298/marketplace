"use client";

import { t } from "@/lib/i18n";
import { money } from "@/lib/format";
import { AdminButton } from "@/components/atoms/admin-button";
import { Icon } from "@/components/atoms/icon";
import type { AdminProduct } from "../../lib/product-repository";
import styles from "./product-admin.module.css";

type ProductCardProps = {
  product: AdminProduct;
  /** URL of the cover photo at card size, or null when the product has no photo yet. */
  imageUrl: string | null;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
};

/** One product in the admin list. The toggle switches between on sale (active) and hidden (draft). */
export function ProductCard({ product: p, imageUrl, busy, onEdit, onToggle }: ProductCardProps) {
  const active = p.status === "active";
  return (
    <article className="product">
      <div className={styles.cover}>
        {imageUrl ? (
          <img src={imageUrl} alt={p.photos[0]?.alt || p.name} loading="lazy" />
        ) : (
          <>
            <Icon name="products" strokeWidth={1.5} />
            <small>{t("admin.catalog.card.noPhoto")}</small>
          </>
        )}
        <span className={`${styles.statusPill} ${styles.coverBadge}`} data-status={p.status}>{t(`admin.catalog.status.${p.status}`)}</span>
        {p.photos.length > 1 && <span className={styles.photoCount}>{t("admin.catalog.card.photoCount", { count: p.photos.length })}</span>}
      </div>
      <div className="product-body">
        <h3>{p.name}</h3>
        <span className="sub">{p.categoryName}</span>
        <div className="product-meta">
          <b>{money(p.price)}</b>
          {p.compareAtPrice !== null && <span className={styles.compare}>{money(p.compareAtPrice)}</span>}
        </div>
        <div className={styles.meta}>
          <span>{t("admin.catalog.card.stock", { stock: p.stock })}</span>
          <span>{t("admin.catalog.card.weight", { weight: p.weightGram.toLocaleString("id-ID") })}</span>
        </div>
        <div className="product-actions">
          <AdminButton small onClick={onEdit} disabled={busy}>{t("admin.catalog.card.edit")}</AdminButton>
          <AdminButton variant="soft" small onClick={onToggle} disabled={busy}>{t(active ? "admin.catalog.card.deactivate" : "admin.catalog.card.activate")}</AdminButton>
        </div>
      </div>
    </article>
  );
}
