"use client";

import { t } from "@/lib/i18n";
import { HotPromoItem } from "../../molecules/hot-promo-item";
import { useCatalog } from "@/features/catalog";

export function HotPromoSection() {
  const { products, openDetail } = useCatalog();
  const promos = products.filter((p) => p.promo);
  // Nothing on promo (a new store with no discounted product yet): no empty heading.
  if (promos.length === 0) return null;
  return (
    <section className="hot-section">
      <div className="hot-head">
        <div>
          <span className="hot-kicker">{t("store.hotPromo.kicker")}</span>
          <h2>{t("store.hotPromo.title")}</h2>
        </div>
        <p>{t("store.hotPromo.subtitle")}</p>
      </div>
      <div className="hot-list">
        {promos.map((p) => (
          <HotPromoItem key={p.id} product={p} onOpen={() => openDetail(p)} />
        ))}
      </div>
    </section>
  );
}
