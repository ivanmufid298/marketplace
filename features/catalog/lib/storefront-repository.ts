import type { Product } from "@/lib/mock/store";
import { mapDbError } from "./db-errors";
import { buildSrcSet, variantKey } from "./image-variants";
import type { DbClientLike, Result } from "./product-repository";

// What the storefront reads: products that are on sale, with their photos and category, in the shape the shop
// components already use. It asks for active products only, by name, so an admin who browses the shop while signed in
// sees what shoppers see (the database would also hand an admin the drafts).

type PhotoRow = { object_key: string; alt: string; sort_order: number; id?: number; width: number | null; height: number | null };
type Row = {
  id: number;
  name: string;
  description: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  badge: string | null;
  categories: { name: string; sort_order: number } | { name: string; sort_order: number }[] | null;
  product_images: PhotoRow[] | null;
};

const SELECT =
  "id, name, description, price, compare_at_price, stock, badge, categories!inner(name, sort_order, is_active), product_images(id, object_key, alt, sort_order, width, height)";

export type StoreCatalog = {
  products: Product[];
  /** Names of the categories that have at least one product, in the order the admin set. */
  categories: string[];
};

/** "25% OFF" for a price that is a quarter below the struck-through one. Never "0% OFF". */
export function promoLabel(price: number, compareAtPrice: number | null): string | undefined {
  if (compareAtPrice === null || compareAtPrice <= price) return undefined;
  return `${Math.max(1, Math.round((1 - price / compareAtPrice) * 100))}% OFF`;
}

/** @param urlFor public URL of one stored photo file, by its key. */
export function toStoreProduct(row: Row, urlFor: (key: string) => string): Product & { categorySort: number } {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const photos = [...(row.product_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0))
    .map((p) => ({
      src: urlFor(variantKey(p.object_key, 800)),
      srcSet: buildSrcSet((w) => urlFor(variantKey(p.object_key, w))),
      alt: p.alt,
      width: p.width,
      height: p.height,
    }));
  return {
    id: row.id,
    name: row.name,
    cat: category?.name ?? "",
    categorySort: category?.sort_order ?? 0,
    price: row.price,
    ...(row.compare_at_price !== null && row.compare_at_price > row.price ? { oldPrice: row.compare_at_price } : {}),
    stock: row.stock,
    ...(row.badge ? { tag: row.badge } : {}),
    ...(promoLabel(row.price, row.compare_at_price) ? { promo: promoLabel(row.price, row.compare_at_price) } : {}),
    desc: row.description,
    photos,
  };
}

export function createStorefrontRepository(db: DbClientLike, urlFor: (key: string) => string) {
  return {
    async listCatalog(): Promise<Result<StoreCatalog>> {
      const { data, error } = await db
        .from("products")
        .select(SELECT)
        .eq("status", "active")
        .eq("categories.is_active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) return { ok: false, error: mapDbError(error) };

      const rows = ((data ?? []) as unknown as Row[]).map((row) => toStoreProduct(row, urlFor));
      const seen = new Map<string, number>();
      for (const row of rows) if (row.cat && !seen.has(row.cat)) seen.set(row.cat, row.categorySort);
      const categories = [...seen.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([name]) => name);
      const products = rows.map(({ categorySort: _sort, ...product }) => product);
      return { ok: true, value: { products, categories } };
    },
  };
}

export type StorefrontRepository = ReturnType<typeof createStorefrontRepository>;
