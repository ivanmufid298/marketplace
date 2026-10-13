"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { CATEGORIES as MOCK_CATEGORIES, products as mockProducts, type Product, type SortMode } from "@/lib/mock/store";
import { useUi } from "@/shared/ui-state/ui-provider";
import { ALL_CATEGORIES, filterProducts } from "./lib/filter-products";
import { createBrowserStorefrontServices, databaseConfigured, type StorefrontServices } from "./lib/storefront-services";

// The one place the storefront gets its products from: the database when the build has Supabase credentials, the
// sample list otherwise (the local demo). Cart, checkout, and orders keep calling getProduct().

/** `loading` and `error` only happen with the database; the sample list is ready from the first render. */
export type CatalogStatus = "loading" | "ready" | "error";

type CatalogContextValue = {
  products: Product[];
  /** Names of the categories that have products, for the category menus. */
  categories: string[];
  status: CatalogStatus;
  /** Tries loading the products again after an error. */
  reload: () => void;
  getProduct: (id: number) => Product | undefined;
  /** Products after the category, search, wishlist, and sort choices. */
  visibleProducts: Product[];
  category: string;
  setCategory: (c: string) => void;
  query: string;
  setQuery: (q: string) => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  savedOnly: boolean;
  liked: Set<number>;
  toggleLike: (id: number) => void;
  /** Product shown in the detail panel. */
  selected: Product | null;
  openDetail: (p: Product) => void;
  /** Wishlist view: only saved products, all categories. Scrolls to the product list. */
  showSaved: () => void;
  /** Back to the full catalog: clears the wishlist view, category, and search, and scrolls to the top. */
  showAll: () => void;
  scrollToProducts: () => void;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}

type CatalogProviderProps = {
  children: ReactNode;
  /** Tests pass fakes, which also switches the provider to the database path. */
  services?: StorefrontServices;
};

type Loaded = { status: CatalogStatus; products: Product[]; categories: string[] };

export function CatalogProvider({ children, services: provided }: CatalogProviderProps) {
  const { setPanel, showToast } = useUi();
  const fromDatabase = provided !== undefined || databaseConfigured();
  // Built after mount so the server render never creates a browser client.
  const [services, setServices] = useState<StorefrontServices | null>(provided ?? null);
  const [loaded, setLoaded] = useState<Loaded>(
    fromDatabase ? { status: "loading", products: [], categories: [] } : { status: "ready", products: mockProducts, categories: [...MOCK_CATEGORIES] },
  );
  const { products, categories, status } = loaded;

  useEffect(() => {
    if (fromDatabase && !services) setServices(createBrowserStorefrontServices());
  }, [fromDatabase, services]);

  const reload = useCallback(async () => {
    if (!services) return;
    setLoaded((current) => ({ ...current, status: "loading" }));
    const result = await services.repo.listCatalog();
    setLoaded(result.ok ? { status: "ready", ...result.value } : { status: "error", products: [], categories: [] });
  }, [services]);

  useEffect(() => {
    // Loading the catalog on mount is the point of this effect; the state it sets is the result.
    void reload();
  }, [reload]);

  const [category, setCategoryState] = useState(ALL_CATEGORIES);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("popular");
  const [savedOnly, setSavedOnly] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Product | null>(null);

  const getProduct = useCallback((id: number) => products.find((p) => p.id === id), [products]);

  const setCategory = useCallback((c: string) => {
    setCategoryState(c);
    setSavedOnly(false);
  }, []);

  const visibleProducts = useMemo(
    () => filterProducts(products, { category, query, savedOnly, liked, sort }),
    [products, category, query, savedOnly, liked, sort],
  );

  const toggleLike = useCallback(
    (id: number) => {
      setLiked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      showToast(liked.has(id) ? t("store.toast.wishlistRemoved") : t("store.toast.wishlistAdded"));
    },
    [liked, showToast],
  );

  const openDetail = useCallback(
    (p: Product) => {
      setSelected(p);
      setPanel("detail", true);
    },
    [setPanel],
  );

  const scrollToProducts = useCallback(() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }), []);

  const showSaved = useCallback(() => {
    setSavedOnly(true);
    setCategoryState(ALL_CATEGORIES);
    setTimeout(scrollToProducts, 0);
    if (!liked.size) showToast(t("store.toast.wishlistEmpty"));
  }, [liked.size, scrollToProducts, showToast]);

  const showAll = useCallback(() => {
    setSavedOnly(false);
    setCategoryState(ALL_CATEGORIES);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const value: CatalogContextValue = {
    products, categories, status, reload: () => void reload(), getProduct, visibleProducts, category, setCategory, query, setQuery, sort, setSort, savedOnly, liked, toggleLike,
    selected, openDetail, showSaved, showAll, scrollToProducts,
  };
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
