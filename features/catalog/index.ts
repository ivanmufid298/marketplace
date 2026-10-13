// Public API of the catalog module: what the storefront shows and how a shopper narrows it down.

export { CatalogProvider, useCatalog } from "./catalog-provider";
export { ALL_CATEGORIES, filterProducts, type CatalogFilter } from "./lib/filter-products";
export type { Product, SortMode } from "@/lib/mock/store";
