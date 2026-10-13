import type { SupabaseClient } from "@supabase/supabase-js";
import { mapDbError, type SaveError } from "./db-errors";
import { slugify, slugWithSuffix, toProductRow, type ProductInput, type ProductStatus } from "./product-form";

// Reads and writes products, categories, and photo rows for the admin screens, straight from the browser. There is no
// server in between on purpose: Row Level Security decides what the signed-in person may do (an admin may change
// anything, everyone else is refused), so this code needs no permission checks of its own.

export type Category = { id: number; name: string; slug: string; sortOrder: number; isActive: boolean };
export type ProductPhoto = { id: number; objectKey: string; alt: string; sortOrder: number; width: number | null; height: number | null };
export type AdminProduct = {
  id: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  categoryName: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  weightGram: number;
  badge: string | null;
  status: ProductStatus;
  sortOrder: number;
  photos: ProductPhoto[];
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: SaveError };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: SaveError): Result<T> => ({ ok: false, error });

/** Only `from` is used, so a fake can stand in for the client in tests. */
export type DbClientLike = Pick<SupabaseClient, "from">;

type PhotoRow = { id: number; object_key: string; alt: string; sort_order: number; width: number | null; height: number | null };
type ProductRow = {
  id: number; slug: string; name: string; description: string; category_id: number; price: number; compare_at_price: number | null;
  stock: number; weight_gram: number; badge: string | null; status: ProductStatus; sort_order: number;
  categories?: { name: string } | { name: string }[] | null;
  product_images?: PhotoRow[] | null;
};
type CategoryRow = { id: number; name: string; slug: string; sort_order: number; is_active: boolean };

const PHOTO_COLUMNS = "id, object_key, alt, sort_order, width, height";
const PRODUCT_SELECT = `id, slug, name, description, category_id, price, compare_at_price, stock, weight_gram, badge, status, sort_order, categories(name), product_images(${PHOTO_COLUMNS})`;
const CATEGORY_COLUMNS = "id, name, slug, sort_order, is_active";
/** How many `-2`, `-3`, ... slugs to try before giving up. */
const SLUG_ATTEMPTS = 6;

export const toPhoto = (row: PhotoRow): ProductPhoto => ({
  id: row.id, objectKey: row.object_key, alt: row.alt, sortOrder: row.sort_order, width: row.width, height: row.height,
});

export function toAdminProduct(row: ProductRow): AdminProduct {
  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  return {
    id: row.id, slug: row.slug, name: row.name, description: row.description, categoryId: row.category_id, categoryName: category?.name ?? "",
    price: row.price, compareAtPrice: row.compare_at_price, stock: row.stock, weightGram: row.weight_gram, badge: row.badge, status: row.status,
    sortOrder: row.sort_order,
    photos: (row.product_images ?? []).map(toPhoto).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
  };
}

const toCategory = (row: CategoryRow): Category => ({ id: row.id, name: row.name, slug: row.slug, sortOrder: row.sort_order, isActive: row.is_active });

export function createProductRepository(db: DbClientLike) {
  /** Insert with a slug made from `name`, trying `-2`, `-3`, ... when the address is taken. */
  async function insertWithUniqueSlug<T>(table: "products" | "categories", name: string, row: (slug: string) => object, select: string, map: (data: never) => T): Promise<Result<T>> {
    const base = slugify(name);
    for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt++) {
      const { data, error } = await db.from(table).insert(row(slugWithSuffix(base, attempt))).select(select).single();
      if (!error) return ok(map(data as never));
      const mapped = mapDbError(error);
      if (mapped.kind !== "slugTaken") return fail(mapped);
    }
    return fail({ kind: "slugTaken", ...(table === "products" ? { field: "name" as const } : {}) });
  }

  return {
    async listCategories(): Promise<Result<Category[]>> {
      const { data, error } = await db.from("categories").select(CATEGORY_COLUMNS).order("sort_order", { ascending: true }).order("id", { ascending: true });
      return error ? fail(mapDbError(error)) : ok(((data ?? []) as CategoryRow[]).map(toCategory));
    },

    createCategory(name: string): Promise<Result<Category>> {
      return insertWithUniqueSlug("categories", name, (slug) => ({ name: name.trim(), slug }), CATEGORY_COLUMNS, toCategory);
    },

    /** Renames a category or switches it on or off. The address (slug) stays, like a renamed product's. */
    async updateCategory(id: number, change: { name?: string; isActive?: boolean }): Promise<Result<Category>> {
      const row = {
        ...(change.name !== undefined ? { name: change.name.trim() } : {}),
        ...(change.isActive !== undefined ? { is_active: change.isActive } : {}),
      };
      const { data, error } = await db.from("categories").update(row).eq("id", id).select(CATEGORY_COLUMNS).single();
      return error ? fail(mapDbError(error)) : ok(toCategory(data as unknown as CategoryRow));
    },

    /** Refused by the database while any product still uses the category (`categoryInUse`). */
    async deleteCategory(id: number): Promise<Result<null>> {
      const { data, error } = await db.from("categories").delete().eq("id", id).select("id");
      if (error) return fail(mapDbError(error));
      // Row Level Security hides rows without an error, so "nothing was deleted" has to be checked.
      return (data as unknown[] | null)?.length ? ok(null) : fail({ kind: "notFound" });
    },

    async listProducts(): Promise<Result<AdminProduct[]>> {
      const { data, error } = await db.from("products").select(PRODUCT_SELECT).order("sort_order", { ascending: true }).order("id", { ascending: true });
      return error ? fail(mapDbError(error)) : ok(((data ?? []) as unknown as ProductRow[]).map(toAdminProduct));
    },

    async getProduct(id: number): Promise<Result<AdminProduct>> {
      const { data, error } = await db.from("products").select(PRODUCT_SELECT).eq("id", id).single();
      return error ? fail(mapDbError(error)) : ok(toAdminProduct(data as unknown as ProductRow));
    },

    createProduct(input: ProductInput): Promise<Result<AdminProduct>> {
      return insertWithUniqueSlug("products", input.name, (slug) => toProductRow(input, slug), PRODUCT_SELECT, toAdminProduct as (data: never) => AdminProduct);
    },

    /** The address (slug) is not changed when a product is renamed, so links to it keep working. */
    async updateProduct(id: number, input: ProductInput): Promise<Result<AdminProduct>> {
      const { data, error } = await db.from("products").update(toProductRow(input)).eq("id", id).select(PRODUCT_SELECT).single();
      return error ? fail(mapDbError(error)) : ok(toAdminProduct(data as unknown as ProductRow));
    },

    async setStatus(id: number, status: ProductStatus): Promise<Result<AdminProduct>> {
      const { data, error } = await db.from("products").update({ status }).eq("id", id).select(PRODUCT_SELECT).single();
      return error ? fail(mapDbError(error)) : ok(toAdminProduct(data as unknown as ProductRow));
    },

    async addPhoto(productId: number, photo: { objectKey: string; alt: string; sortOrder: number; width: number | null; height: number | null }): Promise<Result<ProductPhoto>> {
      const { data, error } = await db
        .from("product_images")
        .insert({ product_id: productId, object_key: photo.objectKey, alt: photo.alt, sort_order: photo.sortOrder, width: photo.width, height: photo.height })
        .select(PHOTO_COLUMNS)
        .single();
      return error ? fail(mapDbError(error)) : ok(toPhoto(data as unknown as PhotoRow));
    },

    async removePhoto(photoId: number): Promise<Result<null>> {
      const { error } = await db.from("product_images").delete().eq("id", photoId);
      return error ? fail(mapDbError(error)) : ok(null);
    },

    async updatePhotoAlt(photoId: number, alt: string): Promise<Result<null>> {
      const { error } = await db.from("product_images").update({ alt }).eq("id", photoId);
      return error ? fail(mapDbError(error)) : ok(null);
    },

    /** Saves the display order: the photo at position 0 is the cover. */
    async setPhotoOrder(orderedIds: number[]): Promise<Result<null>> {
      const results = await Promise.all(orderedIds.map((id, index) => db.from("product_images").update({ sort_order: index }).eq("id", id)));
      const failed = results.find((r) => r.error);
      return failed?.error ? fail(mapDbError(failed.error)) : ok(null);
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
