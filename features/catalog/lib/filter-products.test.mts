// Run with `npm test`. The shopper-facing filter, search, and sort rules, without React or a browser.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_CATEGORIES, filterProducts, type CatalogFilter } from "./filter-products.ts";

const p = (id: number, name: string, shop: string, cat: string, price: number) => ({ id, name, shop, cat, price, stock: 5, rating: "", pos: 0, tag: "", desc: "" }) as never;
const list = [
  p(1, "Mug Blush", "Studio Pagi", "Rumah", 89000),
  p(2, "Tote Canvas", "Ruang Karya", "Fashion", 129000),
  p(3, "Headphone", "Audio Room", "Elektronik", 649000),
  p(4, "Lampu Meja", "Rumah Senja", "Rumah", 329000),
] as Parameters<typeof filterProducts>[0];

const base: CatalogFilter = { category: ALL_CATEGORIES, query: "", savedOnly: false, liked: new Set(), sort: "popular" };
const ids = (over: Partial<CatalogFilter>) => filterProducts(list, { ...base, ...over }).map((x) => x.id);

describe("filterProducts", () => {
  it("returns everything in catalog order by default", () => assert.deepEqual(ids({}), [1, 2, 3, 4]));
  it("filters by category", () => assert.deepEqual(ids({ category: "Rumah" }), [1, 4]));
  it("returns nothing for a category with no products", () => assert.deepEqual(ids({ category: "Kecantikan" }), []));
  it("searches name, shop, and category (query is lowercase)", () => {
    assert.deepEqual(ids({ query: "mug" }), [1]);
    assert.deepEqual(ids({ query: "audio" }), [3]);
    assert.deepEqual(ids({ query: "rumah" }), [1, 4]); // category Rumah and shop "Rumah Senja"
  });
  it("combines category and search", () => assert.deepEqual(ids({ category: "Rumah", query: "senja" }), [4]));
  it("shows only saved products in the wishlist view", () => {
    assert.deepEqual(ids({ savedOnly: true, liked: new Set([2, 3]) }), [2, 3]);
    assert.deepEqual(ids({ savedOnly: true }), []);
  });
  it("ignores the wishlist when the wishlist view is off", () => assert.deepEqual(ids({ liked: new Set([2]) }), [1, 2, 3, 4]));
  it("sorts by price, low to high", () => assert.deepEqual(ids({ sort: "low" }), [1, 2, 4, 3]));
  it("sorts by price, high to low", () => assert.deepEqual(ids({ sort: "high" }), [3, 4, 2, 1]));
  it("does not reorder or mutate the source list", () => {
    filterProducts(list, { ...base, sort: "high" });
    assert.deepEqual(list.map((x) => x.id), [1, 2, 3, 4]);
  });
});
