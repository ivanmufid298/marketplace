// Run with `npm run test:ui`. The repository's queries and mapping, against a fake client that records what was asked
// of it and answers from a script. Constraints and permissions are covered by the SQL tests, not here.
import { describe, expect, it } from "vitest";
import { createProductRepository, toAdminProduct, type DbClientLike } from "./product-repository";
import type { ProductInput } from "./product-form";

type Answer = { data?: unknown; error?: { code?: string; message?: string; details?: string } | null };
type Call = { table: string; ops: [string, unknown[]][] };

/** Every `from()` is one query; awaiting it takes the next scripted answer. */
function fakeDb(answers: Answer[]) {
  const calls: Call[] = [];
  let next = 0;
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: unknown = new Proxy({}, {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            const answer = answers[next++] ?? { data: null, error: null };
            return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve, reject);
          };
        }
        return (...args: unknown[]) => {
          call.ops.push([String(prop), args]);
          return chain;
        };
      },
    });
    return chain;
  };
  return { db: { from } as unknown as DbClientLike, calls };
}

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 7, slug: "mug-blush-daily", name: "Mug Blush Daily", description: "Halus", category_id: 1, price: 89000, compare_at_price: 119000, stock: 5,
  weight_gram: 350, badge: "Baru", status: "active", sort_order: 0, categories: { name: "Rumah" },
  product_images: [
    { id: 11, object_key: "products/7/b.webp", alt: "B", sort_order: 1, width: 1600, height: 1200 },
    { id: 10, object_key: "products/7/a.webp", alt: "A", sort_order: 0, width: 1600, height: 1200 },
  ],
  ...over,
});
const input: ProductInput = { name: "Mug Blush Daily", description: "Halus", categoryId: 1, price: 89000, compareAtPrice: null, stock: 5, weightGram: 350, badge: null, status: "draft" };
const slugClash = { code: "23505", message: 'duplicate key value violates unique constraint "products_slug_key"' };
const opsOf = (call: Call, name: string) => call.ops.filter(([op]) => op === name).map(([, args]) => args);

describe("toAdminProduct", () => {
  it("maps columns to the admin model and orders photos by position", () => {
    const product = toAdminProduct(productRow() as never);
    expect(product).toMatchObject({ id: 7, slug: "mug-blush-daily", categoryId: 1, categoryName: "Rumah", compareAtPrice: 119000, weightGram: 350, badge: "Baru", status: "active" });
    expect(product.photos.map((p) => p.id)).toEqual([10, 11]);
    expect(product.photos[0]).toEqual({ id: 10, objectKey: "products/7/a.webp", alt: "A", sortOrder: 0, width: 1600, height: 1200 });
  });
  it("handles the category as an array, missing, or null, and no photos", () => {
    expect(toAdminProduct(productRow({ categories: [{ name: "Fashion" }] }) as never).categoryName).toBe("Fashion");
    expect(toAdminProduct(productRow({ categories: null }) as never).categoryName).toBe("");
    expect(toAdminProduct(productRow({ categories: undefined, product_images: null }) as never)).toMatchObject({ categoryName: "", photos: [] });
  });
  it("breaks a tie in position by id so the order is stable", () => {
    const rows = [{ id: 3, object_key: "c", alt: "", sort_order: 0, width: null, height: null }, { id: 2, object_key: "b", alt: "", sort_order: 0, width: null, height: null }];
    expect(toAdminProduct(productRow({ product_images: rows }) as never).photos.map((p) => p.id)).toEqual([2, 3]);
  });
});

describe("listProducts / getProduct", () => {
  it("lists every product in display order", async () => {
    const { db, calls } = fakeDb([{ data: [productRow(), productRow({ id: 8 })] }]);
    const result = await createProductRepository(db).listProducts();
    expect(result.ok && result.value.map((p) => p.id)).toEqual([7, 8]);
    expect(calls[0].table).toBe("products");
    expect(opsOf(calls[0], "order")).toEqual([["sort_order", { ascending: true }], ["id", { ascending: true }]]);
  });
  it("returns an empty list, not null, when there are no products", async () => {
    const { db } = fakeDb([{ data: null }]);
    const result = await createProductRepository(db).listProducts();
    expect(result).toEqual({ ok: true, value: [] });
  });
  it("turns a database error into a result instead of throwing", async () => {
    const { db } = fakeDb([{ error: { code: "42501", message: "permission denied for table products" } }]);
    expect(await createProductRepository(db).listProducts()).toEqual({ ok: false, error: { kind: "forbidden" } });
  });
  it("gets one product by id", async () => {
    const { db, calls } = fakeDb([{ data: productRow() }]);
    const result = await createProductRepository(db).getProduct(7);
    expect(result.ok && result.value.id).toBe(7);
    expect(opsOf(calls[0], "eq")).toEqual([["id", 7]]);
  });
  it("reports a product that is missing or hidden as notFound", async () => {
    const { db } = fakeDb([{ error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } }]);
    expect(await createProductRepository(db).getProduct(99)).toEqual({ ok: false, error: { kind: "notFound" } });
  });
});

describe("createProduct", () => {
  it("inserts with a slug made from the name and the database column names", async () => {
    const { db, calls } = fakeDb([{ data: productRow() }]);
    const result = await createProductRepository(db).createProduct(input);
    expect(result.ok && result.value.slug).toBe("mug-blush-daily");
    expect(opsOf(calls[0], "insert")[0][0]).toEqual({
      slug: "mug-blush-daily", name: "Mug Blush Daily", description: "Halus", category_id: 1, price: 89000, compare_at_price: null, stock: 5, weight_gram: 350, badge: null, status: "draft",
    });
  });
  it("tries -2 when the address is taken, then -3", async () => {
    const { db, calls } = fakeDb([{ error: slugClash }, { error: slugClash }, { data: productRow({ slug: "mug-blush-daily-3" }) }]);
    const result = await createProductRepository(db).createProduct(input);
    expect(result.ok && result.value.slug).toBe("mug-blush-daily-3");
    expect(calls.map((c) => (opsOf(c, "insert")[0][0] as { slug: string }).slug)).toEqual(["mug-blush-daily", "mug-blush-daily-2", "mug-blush-daily-3"]);
  });
  it("gives up after six addresses with a name error", async () => {
    const { db, calls } = fakeDb(Array(10).fill({ error: slugClash }));
    const result = await createProductRepository(db).createProduct(input);
    expect(result).toEqual({ ok: false, error: { kind: "slugTaken", field: "name" } });
    expect(calls).toHaveLength(6);
  });
  it("stops at once on any other error, such as a permission problem", async () => {
    const { db, calls } = fakeDb([{ error: { code: "42501", message: 'new row violates row-level security policy for table "products"' } }, { data: productRow() }]);
    const result = await createProductRepository(db).createProduct(input);
    expect(result).toEqual({ ok: false, error: { kind: "forbidden" } });
    expect(calls).toHaveLength(1);
  });
  it("reports a rejected value with its field", async () => {
    const { db } = fakeDb([{ error: { code: "23514", message: 'new row for relation "products" violates check constraint "products_weight_gram_check"' } }]);
    expect(await createProductRepository(db).createProduct(input)).toEqual({ ok: false, error: { kind: "invalidValue", field: "weightGram" } });
  });
});

describe("updateProduct / setStatus", () => {
  it("updates by id without touching the slug", async () => {
    const { db, calls } = fakeDb([{ data: productRow({ name: "Baru" }) }]);
    const result = await createProductRepository(db).updateProduct(7, { ...input, name: "Baru" });
    expect(result.ok && result.value.name).toBe("Baru");
    const [patch] = opsOf(calls[0], "update")[0];
    expect(patch).toMatchObject({ name: "Baru", weight_gram: 350 });
    expect("slug" in (patch as object)).toBe(false);
    expect(opsOf(calls[0], "eq")).toEqual([["id", 7]]);
  });
  it("tells the admin when nothing was updated (a buyer, or a stale id)", async () => {
    const { db } = fakeDb([{ error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" } }]);
    expect(await createProductRepository(db).updateProduct(7, input)).toEqual({ ok: false, error: { kind: "notFound" } });
  });
  it("changes only the status", async () => {
    const { db, calls } = fakeDb([{ data: productRow({ status: "archived" }) }]);
    const result = await createProductRepository(db).setStatus(7, "archived");
    expect(result.ok && result.value.status).toBe("archived");
    expect(opsOf(calls[0], "update")).toEqual([[{ status: "archived" }]]);
  });
});

describe("photos", () => {
  it("adds a photo row with the database column names", async () => {
    const { db, calls } = fakeDb([{ data: { id: 5, object_key: "products/7/x.webp", alt: "Mug", sort_order: 2, width: 1600, height: 1200 } }]);
    const result = await createProductRepository(db).addPhoto(7, { objectKey: "products/7/x.webp", alt: "Mug", sortOrder: 2, width: 1600, height: 1200 });
    expect(result.ok && result.value).toEqual({ id: 5, objectKey: "products/7/x.webp", alt: "Mug", sortOrder: 2, width: 1600, height: 1200 });
    expect(opsOf(calls[0], "insert")[0][0]).toEqual({ product_id: 7, object_key: "products/7/x.webp", alt: "Mug", sort_order: 2, width: 1600, height: 1200 });
  });
  it("removes a photo row by id", async () => {
    const { db, calls } = fakeDb([{}]);
    expect(await createProductRepository(db).removePhoto(5)).toEqual({ ok: true, value: null });
    expect(calls[0].table).toBe("product_images");
    expect(opsOf(calls[0], "delete")).toHaveLength(1);
    expect(opsOf(calls[0], "eq")).toEqual([["id", 5]]);
  });
  it("saves the order as positions starting at zero", async () => {
    const { db, calls } = fakeDb([{}, {}, {}]);
    expect(await createProductRepository(db).setPhotoOrder([30, 10, 20])).toEqual({ ok: true, value: null });
    expect(calls.map((c) => [opsOf(c, "update")[0][0], opsOf(c, "eq")[0]])).toEqual([[{ sort_order: 0 }, ["id", 30]], [{ sort_order: 1 }, ["id", 10]], [{ sort_order: 2 }, ["id", 20]]]);
  });
  it("reports a failure while saving the order", async () => {
    const { db } = fakeDb([{}, { error: { code: "42501", message: "permission denied" } }]);
    expect(await createProductRepository(db).setPhotoOrder([1, 2])).toEqual({ ok: false, error: { kind: "forbidden" } });
  });
  it("saves nothing for an empty order", async () => {
    const { db, calls } = fakeDb([]);
    expect(await createProductRepository(db).setPhotoOrder([])).toEqual({ ok: true, value: null });
    expect(calls).toHaveLength(0);
  });
  it("updates a photo's description", async () => {
    const { db, calls } = fakeDb([{}]);
    await createProductRepository(db).updatePhotoAlt(5, "Mug biru");
    expect(opsOf(calls[0], "update")).toEqual([[{ alt: "Mug biru" }]]);
  });
});

describe("categories", () => {
  it("lists categories in display order", async () => {
    const { db, calls } = fakeDb([{ data: [{ id: 1, name: "Rumah", slug: "rumah", sort_order: 0, is_active: true }] }]);
    const result = await createProductRepository(db).listCategories();
    expect(result).toEqual({ ok: true, value: [{ id: 1, name: "Rumah", slug: "rumah", sortOrder: 0, isActive: true }] });
    expect(calls[0].table).toBe("categories");
  });
  it("creates a category with a slug and trims the name", async () => {
    const { db, calls } = fakeDb([{ data: { id: 2, name: "Kecantikan & Spa", slug: "kecantikan-spa", sort_order: 0, is_active: true } }]);
    const result = await createProductRepository(db).createCategory("  Kecantikan & Spa  ");
    expect(result.ok && result.value.slug).toBe("kecantikan-spa");
    expect(opsOf(calls[0], "insert")[0][0]).toEqual({ name: "Kecantikan & Spa", slug: "kecantikan-spa" });
  });
  it("retries a slug clash for a category but not a name clash", async () => {
    const slugTaken = { code: "23505", message: 'duplicate key value violates unique constraint "categories_slug_key"' };
    const nameTaken = { code: "23505", message: 'duplicate key value violates unique constraint "categories_name_key"' };
    const retried = fakeDb([{ error: slugTaken }, { data: { id: 3, name: "Rumah!", slug: "rumah-2", sort_order: 0, is_active: true } }]);
    expect((await createProductRepository(retried.db).createCategory("Rumah!")).ok).toBe(true);
    expect(retried.calls).toHaveLength(2);

    const stopped = fakeDb([{ error: nameTaken }, { data: {} }]);
    expect(await createProductRepository(stopped.db).createCategory("rumah")).toEqual({ ok: false, error: { kind: "categoryNameTaken" } });
    expect(stopped.calls).toHaveLength(1);
  });
  it("renames a category without touching its address, and trims the name", async () => {
    const { db, calls } = fakeDb([{ data: { id: 2, name: "Fashion", slug: "fashion", sort_order: 0, is_active: true } }]);
    const result = await createProductRepository(db).updateCategory(2, { name: "  Fashion  " });
    expect(result).toEqual({ ok: true, value: { id: 2, name: "Fashion", slug: "fashion", sortOrder: 0, isActive: true } });
    expect(opsOf(calls[0], "update")[0][0]).toStrictEqual({ name: "Fashion" });
    expect(opsOf(calls[0], "eq")[0]).toEqual(["id", 2]);
  });
  it("switches a category off and only sends the field that changed", async () => {
    const { db, calls } = fakeDb([{ data: { id: 2, name: "Fashion", slug: "fashion", sort_order: 0, is_active: false } }]);
    const result = await createProductRepository(db).updateCategory(2, { isActive: false });
    expect(result.ok && result.value.isActive).toBe(false);
    expect(opsOf(calls[0], "update")[0][0]).toStrictEqual({ is_active: false });
  });
  it("reports a rename to a name that is taken, and a category that is gone", async () => {
    const taken = fakeDb([{ error: { code: "23505", message: 'duplicate key value violates unique constraint "categories_name_key"' } }]);
    expect(await createProductRepository(taken.db).updateCategory(2, { name: "Rumah" })).toEqual({ ok: false, error: { kind: "categoryNameTaken" } });
    const gone = fakeDb([{ error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }]);
    expect(await createProductRepository(gone.db).updateCategory(9, { name: "X" })).toEqual({ ok: false, error: { kind: "notFound" } });
  });
  it("deletes a category", async () => {
    const { db, calls } = fakeDb([{ data: [{ id: 2 }] }]);
    expect(await createProductRepository(db).deleteCategory(2)).toEqual({ ok: true, value: null });
    expect(calls[0].table).toBe("categories");
    expect(calls[0].ops.map(([name]) => name)).toContain("delete");
    expect(opsOf(calls[0], "eq")[0]).toEqual(["id", 2]);
  });
  it("refuses to delete a category that products use", async () => {
    const { db } = fakeDb([{ error: { code: "23503", message: 'update or delete on table "categories" violates foreign key constraint "products_category_id_fkey" on table "products"' } }]);
    expect(await createProductRepository(db).deleteCategory(1)).toEqual({ ok: false, error: { kind: "categoryInUse" } });
  });
  it("treats a delete that removed nothing as not found, since security rules hide rows silently", async () => {
    const empty = fakeDb([{ data: [] }]);
    expect(await createProductRepository(empty.db).deleteCategory(1)).toEqual({ ok: false, error: { kind: "notFound" } });
    const nothing = fakeDb([{ data: null }]);
    expect(await createProductRepository(nothing.db).deleteCategory(1)).toEqual({ ok: false, error: { kind: "notFound" } });
  });
});
