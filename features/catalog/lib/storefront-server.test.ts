// Run with `npm run test:ui`. Reading the shop from the server: no database call for an impossible address, and a
// missing setting or a failed read looks like "nothing" instead of throwing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries: { table: string; ops: [string, unknown[]][] }[] = [];
let answer: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const created: { url: string; key: string; options: unknown }[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: unknown) => {
    created.push({ url, key, options });
    return {
      from: (table: string) => {
        const query = { table, ops: [] as [string, unknown[]][] };
        queries.push(query);
        const chain: unknown = new Proxy({}, {
          get(_t, prop) {
            if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(answer).then(resolve);
            return (...args: unknown[]) => { query.ops.push([String(prop), args]); return chain; };
          },
        });
        return chain;
      },
    };
  },
}));

const { getStoreProductBySlug, listStoreSitemapEntries } = await import("./storefront-server");
const row = { id: 1, slug: "mug", name: "Mug", description: "d", price: 1000, compare_at_price: null, stock: 1, badge: null, categories: { name: "Rumah", sort_order: 0 }, product_images: [] };

beforeEach(() => {
  queries.length = 0;
  created.length = 0;
  answer = { data: null, error: null };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("getStoreProductBySlug", () => {
  it("returns the product, reading with the public key and no stored session", async () => {
    answer = { data: row, error: null };
    expect(await getStoreProductBySlug("mug")).toMatchObject({ id: 1, slug: "mug", name: "Mug" });
    expect(created[0]).toMatchObject({ url: "https://x.supabase.co", key: "anon-key", options: { auth: { persistSession: false, autoRefreshToken: false } } });
  });
  it("builds photo links against the project's public storage", async () => {
    answer = { data: { ...row, product_images: [{ id: 1, object_key: "products/1/abcdefgh.webp", alt: "", sort_order: 0, width: 1600, height: 1600 }] }, error: null };
    const product = await getStoreProductBySlug("mug");
    expect(product?.photos?.[0].src).toBe("https://x.supabase.co/storage/v1/object/public/product-images/products/1/abcdefgh-800.webp");
  });
  it("returns null without asking the database for an address that cannot exist", async () => {
    for (const bad of ["", "Mug", "mug_1", "mug/../x", "a b", "-a", "a--b", "x".repeat(81)]) expect(await getStoreProductBySlug(bad)).toBeNull();
    expect(queries).toHaveLength(0);
  });
  it("accepts an address of exactly 80 characters", async () => {
    await getStoreProductBySlug("x".repeat(80));
    expect(queries).toHaveLength(1);
  });
  it("returns null when there is no such product, when the read fails, and when the shop has no database", async () => {
    expect(await getStoreProductBySlug("mug")).toBeNull();
    answer = { data: null, error: { message: "Failed to fetch" } };
    expect(await getStoreProductBySlug("mug")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await getStoreProductBySlug("mug")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " ");
    expect(await getStoreProductBySlug("mug")).toBeNull();
  });
});

describe("listStoreSitemapEntries", () => {
  it("lists the products to show to search engines", async () => {
    answer = { data: [{ slug: "mug", updated_at: "2026-10-01T00:00:00Z" }], error: null };
    expect(await listStoreSitemapEntries()).toEqual([{ slug: "mug", updatedAt: "2026-10-01T00:00:00Z" }]);
  });
  it("is empty when the read fails or the shop has no database", async () => {
    answer = { data: null, error: { message: "Failed to fetch" } };
    expect(await listStoreSitemapEntries()).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await listStoreSitemapEntries()).toEqual([]);
  });
});
