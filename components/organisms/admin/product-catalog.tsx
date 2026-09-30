"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { adminProducts, PRODUCT_CATEGORIES } from "@/lib/mock/admin";
import { AdminButton } from "../../atoms/admin-button";
import { AdminProductCard } from "../../molecules/admin-product-card";
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
          <AdminProductCard
            key={p.name}
            product={p}
            onEdit={() => showToast(t("admin.products.toastEdit"))}
            onToggleStatus={() => showToast(t("admin.products.toastStatus"))}
          />
        ))}
      </div>
    </section>
  );
}
