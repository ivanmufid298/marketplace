// Run with `npm run test:ui`. What the shop asks the database for and how rows become shop products. Visibility
// (drafts hidden from shoppers) is enforced by Row Level Security and covered by the SQL tests; this file checks the
// query asks for it by name too, so a signed-in admin browsing the shop sees what shoppers see.
import { describe, expect, it } from "vitest";
import type { DbClientLike } from "./product-repository";
import { createStorefrontRepository, promoLabel, toStoreProduct } from "./storefront-repository";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type Call = { table: string; ops: [string, unknown[]][] };

function fakeDb(answer: Answer) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const chain: unknown = new Proxy({}, {
      get(_target, prop) {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
        return (...args: unknown[]) => { call.ops.push([String(prop), args]); return chain; };
      },
    });
    return chain;
  };
  return { db: { from } as unknown as DbClientLike, calls };
}
const opsOf = (call: Call, name: string) => call.ops.filter(([op]) => op === name).map(([, args]) => args);

const urlFor = (key: string) => `https://cdn.test/${key}`;
const photo = (id: number, over: Record<string, unknown> = {}) => ({ id, object_key: `products/1/p${id}aaaaaaaa.webp`, alt: "", sort_order: id, width: 1600, height: 1200, ...over });
const row = (over: Record<string, unknown> = {}) => ({
  id: 1, slug: "mug-blush-daily", name: "Mug Blush Daily", description: "Halus", price: 89000, compare_at_price: 119000, stock: 5, badge: "Best seller",
  categories: { name: "Rumah", sort_order: 0 }, product_images: [photo(1)], ...over,
});

describe("promoLabel", () => {
  it("rounds the discount to a whole percent", () => {
    expect(promoLabel(89000, 119000)).toBe("25% OFF");
    expect(promoLabel(129000, 169000)).toBe("24% OFF");
    expect(promoLabel(459000, 599000)).toBe("23% OFF");
  });
  it("never says 0% and says nothing when there is no real discount", () => {
    expect(promoLabel(99999, 100000)).toBe("1% OFF");
    expect(promoLabel(100, 100)).toBeUndefined();
    expect(promoLabel(100, 90)).toBeUndefined();
    expect(promoLabel(100, null)).toBeUndefined();
  });
});

describe("toStoreProduct", () => {
  it("maps a row to a shop product", () => {
    expect(toStoreProduct(row() as never, urlFor)).toMatchObject({
      id: 1, name: "Mug Blush Daily", cat: "Rumah", price: 89000, oldPrice: 119000, stock: 5, tag: "Best seller", promo: "25% OFF", desc: "Halus",
    });
  });
  it("leaves out the old price, tag, and promo when the product has none", () => {
    const product = toStoreProduct(row({ compare_at_price: null, badge: null }) as never, urlFor);
    expect(product).not.toHaveProperty("oldPrice");
    expect(product).not.toHaveProperty("tag");
    expect(product).not.toHaveProperty("promo");
    expect(product).not.toHaveProperty("shop");
    expect(product).not.toHaveProperty("rating");
  });
  it("builds photo sources: the 800 px file as src and all three sizes in srcSet, cover first", () => {
    const product = toStoreProduct(row({ product_images: [photo(2, { sort_order: 1 }), photo(1, { sort_order: 0, alt: "Mug dari depan" })] }) as never, urlFor);
    expect(product.photos).toHaveLength(2);
    expect(product.photos![0]).toEqual({
      src: "https://cdn.test/products/1/p1aaaaaaaa-800.webp",
      srcSet: "https://cdn.test/products/1/p1aaaaaaaa-400.webp 400w, https://cdn.test/products/1/p1aaaaaaaa-800.webp 800w, https://cdn.test/products/1/p1aaaaaaaa-1600.webp 1600w",
      alt: "Mug dari depan", width: 1600, height: 1200,
    });
    expect(product.photos![1].src).toContain("p2aaaaaaaa-800.webp");
  });
  it("keeps an empty photo list (not undefined) so the shop knows it is a database product", () => {
    expect(toStoreProduct(row({ product_images: [] }) as never, urlFor).photos).toEqual([]);
    expect(toStoreProduct(row({ product_images: null }) as never, urlFor).photos).toEqual([]);
  });
  it("accepts the category as an array", () => {
    expect(toStoreProduct(row({ categories: [{ name: "Fashion", sort_order: 3 }] }) as never, urlFor).cat).toBe("Fashion");
  });
});

describe("listCatalog", () => {
  it("asks for active products in active categories only, in the admin's order", async () => {
    const { db, calls } = fakeDb({ data: [] });
    await createStorefrontRepository(db, urlFor).listCatalog();
    expect(calls[0].table).toBe("products");
    expect(String(opsOf(calls[0], "select")[0][0])).toContain("categories!inner(");
    expect(opsOf(calls[0], "eq")).toEqual([["status", "active"], ["categories.is_active", true]]);
    expect(opsOf(calls[0], "order")).toEqual([["sort_order", { ascending: true }], ["id", { ascending: true }]]);
  });
  it("returns products and the categories that have products, by the admin's category order and then by name", async () => {
    const { db } = fakeDb({
      data: [
        row({ id: 1, categories: { name: "Rumah", sort_order: 0 } }),
        row({ id: 2, categories: { name: "Fashion", sort_order: 5 } }),
        row({ id: 3, categories: { name: "Rumah", sort_order: 0 } }),
        row({ id: 4, categories: { name: "Aksesori", sort_order: 5 } }),
      ],
    });
    const result = await createStorefrontRepository(db, urlFor).listCatalog();
    expect(result.ok && result.value.categories).toEqual(["Rumah", "Aksesori", "Fashion"]);
    expect(result.ok && result.value.products.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    // The sorting helper does not leak into the products the shop shows.
    expect(result.ok && result.value.products[0]).not.toHaveProperty("categorySort");
  });
  it("returns an empty catalog for a store with no products yet", async () => {
    expect(await createStorefrontRepository(fakeDb({ data: [] }).db, urlFor).listCatalog()).toEqual({ ok: true, value: { products: [], categories: [] } });
    expect(await createStorefrontRepository(fakeDb({ data: null }).db, urlFor).listCatalog()).toEqual({ ok: true, value: { products: [], categories: [] } });
  });
  it("reports a failed read with the mapped reason", async () => {
    const { db } = fakeDb({ error: { message: "Failed to fetch" } });
    expect(await createStorefrontRepository(db, urlFor).listCatalog()).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("getBySlug", () => {
  it("asks for one active product in an active category by its address", async () => {
    const { db, calls } = fakeDb({ data: row() });
    await createStorefrontRepository(db, urlFor).getBySlug("mug-blush-daily");
    expect(calls[0].table).toBe("products");
    expect(opsOf(calls[0], "eq")).toEqual([["slug", "mug-blush-daily"], ["status", "active"], ["categories.is_active", true]]);
    expect(calls[0].ops.map(([name]) => name)).toContain("maybeSingle");
  });
  it("returns the product with its address and without the sorting helper", async () => {
    const result = await createStorefrontRepository(fakeDb({ data: row() }).db, urlFor).getBySlug("mug-blush-daily");
    expect(result.ok && result.value).toMatchObject({ id: 1, slug: "mug-blush-daily", name: "Mug Blush Daily", cat: "Rumah" });
    expect(result.ok && result.value).not.toHaveProperty("categorySort");
  });
  it("returns null when nothing matches, which is not an error", async () => {
    expect(await createStorefrontRepository(fakeDb({ data: null }).db, urlFor).getBySlug("nope")).toEqual({ ok: true, value: null });
  });
  it("reports a failed read", async () => {
    const result = await createStorefrontRepository(fakeDb({ error: { message: "Failed to fetch" } }).db, urlFor).getBySlug("x");
    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
  it("gives every product an address in the list too", async () => {
    const result = await createStorefrontRepository(fakeDb({ data: [row({ slug: "a" }), row({ id: 2, slug: "b" })] }).db, urlFor).listCatalog();
    expect(result.ok && result.value.products.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});

describe("listSitemapEntries", () => {
  it("lists active products in active categories with their last change", async () => {
    const { db, calls } = fakeDb({ data: [{ slug: "a", updated_at: "2026-10-01T00:00:00Z" }, { slug: "b", updated_at: "2026-10-02T00:00:00Z" }] });
    const result = await createStorefrontRepository(db, urlFor).listSitemapEntries();
    expect(result).toEqual({ ok: true, value: [{ slug: "a", updatedAt: "2026-10-01T00:00:00Z" }, { slug: "b", updatedAt: "2026-10-02T00:00:00Z" }] });
    expect(opsOf(calls[0], "eq")).toEqual([["status", "active"], ["categories.is_active", true]]);
  });
  it("is empty for no products and reports a failed read", async () => {
    expect(await createStorefrontRepository(fakeDb({ data: null }).db, urlFor).listSitemapEntries()).toEqual({ ok: true, value: [] });
    expect(await createStorefrontRepository(fakeDb({ error: { message: "Failed to fetch" } }).db, urlFor).listSitemapEntries()).toEqual({ ok: false, error: { kind: "network" } });
  });
});
