"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { adminProducts, PRODUCT_CATEGORIES } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { Icon } from "../../atoms/icon";
import { SearchField } from "../../molecules/search-field";
import { SectionTop } from "../../molecules/section-top";
import { Select } from "../../molecules/select";
import { useAdmin } from "../../providers/admin-provider";

const ALL = "all";

export function ProductCatalog() {
  const { openModal, showToast } = useAdmin();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const categoryOptions = [{ value: ALL, label: t("admin.products.allCategories") }, ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))];
  const list = adminProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === ALL || p.cat === category));

  return (
    <section className="view active">
      <SectionTop title={t("admin.products.title")} text={t("admin.products.text")}>
        <AdminButton variant="primary" onClick={() => openModal("product")}>{t("admin.products.add")}</AdminButton>
      </SectionTop>
      <div className="filters">
        <SearchField variant="admin" id="productSearch" value={query} onChange={setQuery} placeholder={t("admin.products.searchPlaceholder")} />
        <Select options={categoryOptions} value={category} onChange={setCategory} />
      </div>
      <div className="product-grid" style={{ marginTop: 18 }}>
        {list.map((p) => (
          <article className="product" key={p.name}>
            <div className="product-visual"><Icon name="products" strokeWidth={1.5} /></div>
            <div className="product-body">
              <h3>{p.name}</h3>
              <span className="sub">{p.cat}</span>
              <div className="product-meta"><b>Rp{p.price}</b><span>{t("admin.products.stock", { stock: p.stock })}</span></div>
              <div className="product-actions">
                <AdminButton small onClick={() => showToast(t("admin.products.toastEdit"))}>{t("admin.products.edit")}</AdminButton>
                <AdminButton variant="soft" small onClick={() => showToast(t("admin.products.toastStatus"))}>{t("admin.products.active")}</AdminButton>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
