import type { Product, SortMode } from "@/lib/mock/store";

/** Sentinel for "no category filter". Display text comes from content/id.json. */
export const ALL_CATEGORIES = "all";

export type CatalogFilter = {
  category: string;
  /** Matched against name, shop, and category. Callers pass it lowercase. */
  query: string;
  savedOnly: boolean;
  liked: ReadonlySet<number>;
  sort: SortMode;
};

/** The products the shopper currently sees. "popular" keeps the catalog order; "low" and "high" sort by price. */
export function filterProducts(products: readonly Product[], { category, query, savedOnly, liked, sort }: CatalogFilter): Product[] {
  const list = products.filter(
    (p) =>
      (category === ALL_CATEGORIES || p.cat === category) &&
      (p.name + " " + (p.shop ?? "") + " " + p.cat).toLowerCase().includes(query) &&
      (!savedOnly || liked.has(p.id)),
  );
  if (sort === "low") list.sort((a, b) => a.price - b.price);
  if (sort === "high") list.sort((a, b) => b.price - a.price);
  return list;
}
