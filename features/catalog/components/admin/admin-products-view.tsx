"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { AdminButton } from "@/components/atoms/admin-button";
import { SearchField } from "@/components/molecules/search-field";
import { SectionTop } from "@/components/molecules/section-top";
import { Select } from "@/components/molecules/select";
import type { SaveError } from "../../lib/db-errors";
import { variantKey } from "../../lib/image-variants";
import { PRODUCT_STATUSES } from "../../lib/product-form";
import type { AdminProduct, Category } from "../../lib/product-repository";
import { createBrowserCatalogServices, type CatalogServices } from "../../lib/services";
import { ProductCard } from "./product-card";
import { ProductFormDialog } from "./product-form-dialog";
import styles from "./product-admin.module.css";

const ALL = "all";

type AdminProductsViewProps = {
  /** Tests pass fakes; the real screen leaves this out and gets Supabase from the browser. */
  services?: CatalogServices;
  /** Short messages for the admin shell's toast. */
  notify?: (message: string) => void;
};

type Load = { state: "loading" } | { state: "error"; error: SaveError } | { state: "ready" };
type Dialog = { product: AdminProduct | null } | null;

export function AdminProductsView({ services: provided, notify = () => {} }: AdminProductsViewProps) {
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<CatalogServices | null>(provided ?? null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!services) setServices(createBrowserCatalogServices());
  }, [services]);

  const reload = useCallback(async () => {
    if (!services) return;
    setLoad({ state: "loading" });
    const [cats, prods] = await Promise.all([services.repo.listCategories(), services.repo.listProducts()]);
    if (!cats.ok) return setLoad({ state: "error", error: cats.error });
    if (!prods.ok) return setLoad({ state: "error", error: prods.error });
    setCategories(cats.value);
    setProducts(prods.value);
    setLoad({ state: "ready" });
  }, [services]);

  useEffect(() => {
    // Loading the list on mount is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(
      (p) => (!needle || p.name.toLowerCase().includes(needle)) && (category === ALL || String(p.categoryId) === category) && (status === ALL || p.status === status),
    );
  }, [products, query, category, status]);

  const imageFor = (p: AdminProduct) => (p.photos[0] && services ? services.storage.publicUrl(variantKey(p.photos[0].objectKey, 400)) : null);

  function saved(product: AdminProduct, created: boolean) {
    setProducts((list) => (created ? [...list, product] : list.map((p) => (p.id === product.id ? product : p))));
  }

  async function toggle(product: AdminProduct) {
    if (!services || busyId !== null) return;
    const next = product.status === "active" ? "draft" : "active";
    setBusyId(product.id);
    const result = await services.repo.setStatus(product.id, next);
    setBusyId(null);
    if (!result.ok) return notify(t(`admin.catalog.saveErrors.${result.error.kind}`));
    setProducts((list) => list.map((p) => (p.id === product.id ? result.value : p)));
    notify(t(next === "active" ? "admin.catalog.toast.activated" : "admin.catalog.toast.deactivated"));
  }

  const categoryOptions = [{ value: ALL, label: t("admin.catalog.allCategories") }, ...categories.map((c) => ({ value: String(c.id), label: c.name }))];
  const statusOptions = [{ value: ALL, label: t("admin.catalog.allStatuses") }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: t(`admin.catalog.status.${s}`) }))];

  return (
    <section className="view active">
      <SectionTop title={t("admin.catalog.title")} text={t("admin.catalog.text")}>
        <AdminButton variant="primary" disabled={load.state !== "ready"} onClick={() => setDialog({ product: null })}>{t("admin.catalog.add")}</AdminButton>
      </SectionTop>

      <div className="filters">
        <SearchField variant="admin" id="productSearch" value={query} onChange={setQuery} placeholder={t("admin.catalog.searchPlaceholder")} />
        <Select options={categoryOptions} value={category} onChange={setCategory} />
        <Select options={statusOptions} value={status} onChange={setStatus} />
      </div>

      <div style={{ marginTop: 18 }}>
        {load.state === "loading" && <p className={styles.notice} role="status">{t("admin.catalog.loading")}</p>}
        {load.state === "error" && (
          <div className={styles.notice} role="alert">
            <p>{t("admin.catalog.loadError")} {t(`admin.catalog.saveErrors.${load.error.kind}`)}</p>
            <AdminButton small onClick={() => void reload()}>{t("admin.catalog.retry")}</AdminButton>
          </div>
        )}
        {load.state === "ready" && products.length === 0 && <p className={styles.notice}>{t("admin.catalog.empty")}</p>}
        {load.state === "ready" && products.length > 0 && shown.length === 0 && <p className={styles.notice}>{t("admin.catalog.emptyFiltered")}</p>}
        {load.state === "ready" && shown.length > 0 && (
          <div className="product-grid">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} imageUrl={imageFor(p)} busy={busyId === p.id} onEdit={() => setDialog({ product: p })} onToggle={() => void toggle(p)} />
            ))}
          </div>
        )}
      </div>

      {dialog && services && (
        <ProductFormDialog
          key={dialog.product?.id ?? "new"}
          services={services}
          product={dialog.product}
          categories={categories}
          onCategoryAdded={(c) => setCategories((list) => [...list, c])}
          onSaved={saved}
          onClose={() => setDialog(null)}
          notify={notify}
        />
      )}
    </section>
  );
}
