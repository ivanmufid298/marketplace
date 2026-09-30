"use client";

import { t } from "@/lib/i18n";
import { SORT_VALUES } from "@/lib/mock/store";
import { ProductCard } from "../../molecules/product-card";
import { SortMenu } from "../../molecules/sort-menu";
import { useStore } from "../../providers/store-provider";

export function ProductSection() {
  const { visibleProducts, liked, toggleLike, openDetail, sort, setSort } = useStore();
  const sortOptions = SORT_VALUES.map((value) => ({ value, label: t(`store.products.sort.${value}`) }));

  return (
    <section id="products">
      <div className="section-head">
        <div>
          <h2>{t("store.products.title")}</h2>
          <p>{t("store.products.subtitle")}</p>
        </div>
        <SortMenu options={sortOptions} value={sort} onChange={setSort} />
      </div>
      <div className="grid">
        <div className="empty" style={{ display: visibleProducts.length ? "none" : "block" }}>{t("store.products.empty")}</div>
        {visibleProducts.map((p) => (
          <ProductCard key={p.id} product={p} liked={liked.has(p.id)} onOpen={() => openDetail(p)} onToggleLike={() => toggleLike(p.id)} />
        ))}
      </div>
    </section>
  );
}
