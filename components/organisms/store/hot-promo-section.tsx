"use client";

import { t } from "@/lib/i18n";
import { HotPromoItem } from "../../molecules/hot-promo-item";
import { useStore } from "../../providers/store-provider";

export function HotPromoSection() {
  const { products, openDetail } = useStore();
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
        {products.filter((p) => p.promo).map((p) => (
          <HotPromoItem key={p.id} product={p} onOpen={() => openDetail(p)} />
        ))}
      </div>
    </section>
  );
}
