"use client";

import { t } from "@/lib/i18n";
import { SORT_VALUES } from "@/lib/mock/store";
import { ProductCard } from "../../molecules/product-card";
import { SortMenu } from "../../molecules/sort-menu";
import { useCatalog } from "@/features/catalog";
import { useOpenProduct } from "./use-open-product";

export function ProductSection() {
  const { visibleProducts, liked, toggleLike, sort, setSort, status, reload, products } = useCatalog();
  const openProduct = useOpenProduct();
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
        {status === "loading" && <div className="empty" role="status">{t("store.products.loading")}</div>}
        {status === "error" && (
          <div className="empty" role="alert">
            {t("store.products.loadError")} <button type="button" className="link-btn" onClick={reload}>{t("store.products.retry")}</button>
          </div>
        )}
        {status === "ready" && visibleProducts.length === 0 && <div className="empty">{t(products.length === 0 ? "store.products.emptyStore" : "store.products.empty")}</div>}
        {visibleProducts.map((p) => (
          <ProductCard key={p.id} product={p} liked={liked.has(p.id)} onOpen={() => openProduct(p)} onToggleLike={() => toggleLike(p.id)} />
        ))}
      </div>
    </section>
  );
}
