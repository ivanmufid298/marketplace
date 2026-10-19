// Run with `npm run test:ui`. What the shipping-quote address answers: to whom, with what limits, and in which words when it cannot.
import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "./cache";
import { answerQuote, MAX_ITEMS, MAX_QTY, parseCart } from "./quote-handler";
import type { ProviderError, ProviderRate, ShippingProvider } from "./types";

const rate = (courier: string, service: string, fee: number): ProviderRate => ({ courier, courierName: courier.toUpperCase(), service, description: "Reguler", fee, etd: "1-2 day" });
const RULES = { originId: 17549, couriers: ["jne"], freeShippingMin: null, markup: 0 };
const LINES = [{ weightGram: 500, price: 89000, qty: 2 }];
const body = { destinationId: 17536, items: [{ productId: 1, qty: 2 }] };

function setup(over: { user?: { id: string } | null; rules?: typeof RULES | null; lines?: typeof LINES | null; answer?: { ok: true; value: ProviderRate[] } | { ok: false; error: ProviderError }; secret?: string; body?: unknown } = {}) {
  const quote = vi.fn(async () => over.answer ?? { ok: true as const, value: [rate("jne", "REG", 9000)] });
  const loadRules = vi.fn(async () => ("rules" in over ? over.rules ?? null : RULES));
  const loadLines = vi.fn(async () => ("lines" in over ? over.lines ?? null : LINES));
  const run = () => answerQuote({ body: "body" in over ? over.body : body, user: "user" in over ? over.user ?? null : { id: "buyer-1" }, provider: { searchDestinations: vi.fn(), quote } as unknown as ShippingProvider, cache: createMemoryCache(), secret: over.secret ?? "secret", loadRules, loadLines });
  return { run, quote, loadRules, loadLines };
}

describe("parseCart", () => {
  it("takes a place and items, merging the same product", () => {
    expect(parseCart({ destinationId: 5, items: [{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }, { productId: 1, qty: 3 }] })).toEqual({ destinationId: 5, items: [{ productId: 1, qty: 5 }, { productId: 2, qty: 1 }] });
  });
  it("is null for anything that is not a cart", () => {
    const item = { productId: 1, qty: 1 };
    for (const bad of [null, undefined, "x", 5, [], {}, { items: [item] }, { destinationId: "5", items: [item] }, { destinationId: 0, items: [item] }, { destinationId: 1.5, items: [item] }, { destinationId: 5 }, { destinationId: 5, items: [] }, { destinationId: 5, items: "x" }, { destinationId: 5, items: [null] }, { destinationId: 5, items: ["x"] }, { destinationId: 5, items: [{ productId: "1", qty: 1 }] }, { destinationId: 5, items: [{ productId: 0, qty: 1 }] }, { destinationId: 5, items: [{ productId: 1.5, qty: 1 }] }, { destinationId: 5, items: [{ productId: 1, qty: 0 }] }, { destinationId: 5, items: [{ productId: 1, qty: 1.5 }] }, { destinationId: 5, items: [{ productId: 1, qty: "1" }] }, { destinationId: 5, items: [{ productId: 1 }] }]) {
      expect(parseCart(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it("limits how many kinds of product and how many of one kind, also when the same product comes twice", () => {
    expect(parseCart({ destinationId: 5, items: Array.from({ length: MAX_ITEMS }, (_, i) => ({ productId: i + 1, qty: 1 })) })).not.toBeNull();
    expect(parseCart({ destinationId: 5, items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ productId: i + 1, qty: 1 })) })).toBeNull();
    expect(parseCart({ destinationId: 5, items: [{ productId: 1, qty: MAX_QTY }] })).not.toBeNull();
    expect(parseCart({ destinationId: 5, items: [{ productId: 1, qty: MAX_QTY + 1 }] })).toBeNull();
    expect(parseCart({ destinationId: 5, items: [{ productId: 1, qty: MAX_QTY }, { productId: 1, qty: 1 }] })).toBeNull();
  });
});

describe("the answer", () => {
  it("lists the services with their signed tokens for a signed-in buyer", async () => {
    const reply = await setup().run();
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ weightGram: 1000, subtotal: 178000, freeShipping: false, options: [{ courier: "jne", service: "REG", fee: 9000 }] });
    expect("options" in reply.body && reply.body.options[0].token).toMatch(/^[\w-]+\.[\w-]+$/);
  });
  it("turns away someone who is not signed in before reading anything or spending a hit", async () => {
    const s = setup({ user: null });
    expect(await s.run()).toEqual({ status: 401, body: { error: "signIn" } });
    expect(s.loadRules).not.toHaveBeenCalled();
    expect(s.loadLines).not.toHaveBeenCalled();
    expect(s.quote).not.toHaveBeenCalled();
  });
  it("says it is not a cart, without reading the database", async () => {
    const s = setup({ body: { destinationId: 1, items: [] } });
    expect(await s.run()).toEqual({ status: 400, body: { error: "invalid" } });
    expect(s.loadRules).not.toHaveBeenCalled();
  });
  it("reads the lines for the merged cart", async () => {
    const s = setup({ body: { destinationId: 5, items: [{ productId: 1, qty: 1 }, { productId: 1, qty: 2 }] } });
    await s.run();
    expect(s.loadLines).toHaveBeenCalledWith([{ productId: 1, qty: 3 }]);
  });
  it("says 'not available' when the shop's rules cannot be read, and 'invalid' when a product is not in the database", async () => {
    expect(await setup({ rules: null }).run()).toEqual({ status: 503, body: { error: "unavailable" } });
    const missing = setup({ lines: null });
    expect(await missing.run()).toEqual({ status: 400, body: { error: "invalid" } });
    expect(missing.quote).not.toHaveBeenCalled();
  });
  it("says each thing that cannot be answered in its own word", async () => {
    expect(await setup({ rules: { ...RULES, originId: null as unknown as number } }).run()).toEqual({ status: 503, body: { error: "originMissing" } });
    expect(await setup({ secret: "" }).run()).toEqual({ status: 503, body: { error: "notConfigured" } });
    expect(await setup({ answer: { ok: false, error: "quota" } }).run()).toEqual({ status: 429, body: { error: "quota" } });
    expect(await setup({ answer: { ok: false, error: "rejected" } }).run()).toEqual({ status: 503, body: { error: "unavailable" } });
    expect(await setup({ answer: { ok: true, value: [] } }).run()).toEqual({ status: 422, body: { error: "noRates" } });
    expect(await setup({ lines: [{ weightGram: 0, price: 1, qty: 1 }] }).run()).toEqual({ status: 400, body: { error: "invalid" } });
  });
});
