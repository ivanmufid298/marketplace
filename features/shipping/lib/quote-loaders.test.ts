// Run with `npm run test:ui`. What a quote reads from the database: the shop's rules, and the weight and price of the cart.
import { describe, expect, it } from "vitest";
import { quoteLoaders } from "./quote-loaders";

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
function fake(answers: Record<string, Answer>) {
  const queries: { table: string; ops: [string, unknown[]][] }[] = [];
  const db = {
    from: (table: string) => {
      const query = { table, ops: [] as [string, unknown[]][] };
      queries.push(query);
      const answer = answers[table] ?? {};
      const chain: unknown = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null }).then(resolve);
          return (...args: unknown[]) => { query.ops.push([String(prop), args]); return chain; };
        },
      });
      return chain;
    },
  };
  return { db: db as never, queries };
}
const opsOf = (q: { ops: [string, unknown[]][] }, name: string) => q.ops.filter(([o]) => o === name).map(([, a]) => a);

describe("loadRules", () => {
  it("is the shop's origin, couriers, free-shipping minimum, and markup", async () => {
    const { db } = fake({ shop_settings: { data: { origin_destination_id: 17549, origin_label: "KEBAYORAN", couriers: ["jne", "ninja"], free_shipping_min: 500000, shipping_markup: -2000 } } });
    expect(await quoteLoaders(db).loadRules()).toEqual({ originId: 17549, couriers: ["jne", "ninja"], freeShippingMin: 500000, markup: -2000 });
  });
  it("has no origin until the shop says, and the usual couriers", async () => {
    const { db } = fake({ shop_settings: { data: { origin_destination_id: null, origin_label: null, couriers: null, free_shipping_min: null, shipping_markup: 0 } } });
    expect(await quoteLoaders(db).loadRules()).toEqual({ originId: null, couriers: ["jne", "sicepat", "jnt", "anteraja"], freeShippingMin: null, markup: 0 });
  });
  it("is null when the settings cannot be read", async () => {
    expect(await quoteLoaders(fake({ shop_settings: { error: { message: "Failed to fetch" } } }).db).loadRules()).toBeNull();
  });
});

describe("loadLines", () => {
  it("is the weight and price of each product in the cart, with how many, in the order of the cart", async () => {
    const { db, queries } = fake({ products: { data: [{ id: 2, price: 129000, weight_gram: 450 }, { id: 1, price: 89000, weight_gram: 350 }] } });
    const lines = await quoteLoaders(db).loadLines([{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }]);
    expect(lines).toEqual([{ weightGram: 350, price: 89000, qty: 2 }, { weightGram: 450, price: 129000, qty: 1 }]);
    expect(queries[0].table).toBe("products");
    expect(opsOf(queries[0], "in")).toEqual([["id", [1, 2]]]);
    expect(String(opsOf(queries[0], "select")[0][0])).toBe("id, price, weight_gram");
  });
  it("reads numbers that came as text", async () => {
    const { db } = fake({ products: { data: [{ id: "1", price: "89000", weight_gram: "350" }] } });
    expect(await quoteLoaders(db).loadLines([{ productId: 1, qty: 1 }])).toEqual([{ weightGram: 350, price: 89000, qty: 1 }]);
  });
  it("is null when a product is not there, because it is not on sale or no longer exists", async () => {
    const { db } = fake({ products: { data: [{ id: 1, price: 1, weight_gram: 1 }] } });
    expect(await quoteLoaders(db).loadLines([{ productId: 1, qty: 1 }, { productId: 2, qty: 1 }])).toBeNull();
  });
  it("is null when the database does not answer, or answers with something that is not a list", async () => {
    expect(await quoteLoaders(fake({ products: { error: { message: "Failed to fetch" } } }).db).loadLines([{ productId: 1, qty: 1 }])).toBeNull();
    expect(await quoteLoaders(fake({ products: { data: null } }).db).loadLines([{ productId: 1, qty: 1 }])).toBeNull();
  });
});
