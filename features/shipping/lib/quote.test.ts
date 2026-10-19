// Run with `npm run test:ui`. Pricing a cart's shipping: the weight and total come from the lines, the provider is asked only when needed, the shop's
// rules are applied, and every service offered comes with a token the order can be checked against. (The provider here is a fake.)
import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "./cache";
import { bucketWeight, MAX_PARCEL_GRAMS, quoteShipping, RATES_TTL_SECONDS, WEIGHT_STEP, type QuoteInput, type ShopRules } from "./quote";
import { QUOTE_TTL_SECONDS, verifyQuote } from "./quote-token";
import type { ProviderError, ProviderRate, ShippingProvider } from "./types";

const SECRET = "test-secret-for-signing-quotes";
const NOW = 1_900_000_000_000;
const rate = (courier: string, service: string, fee: number, over: Partial<ProviderRate> = {}): ProviderRate => ({ courier, courierName: courier.toUpperCase(), service, description: `${service} layanan`, fee, etd: "1-2 day", ...over });
const RATES = [rate("sicepat", "REG", 8000), rate("jne", "CTC", 10000), rate("anteraja", "ECO", 7100), rate("jne", "JTR", 40000, { description: "JNE Trucking" })];
const rules: ShopRules = { originId: 17549, couriers: ["jne", "sicepat"], freeShippingMin: null, markup: 0 };
const input: QuoteInput = { userId: "buyer-1", destinationId: 17536, lines: [{ weightGram: 500, price: 89000, qty: 2 }, { weightGram: 300, price: 129000, qty: 1 }] };

function setup(answer: { ok: true; value: ProviderRate[] } | { ok: false; error: ProviderError } = { ok: true, value: RATES }) {
  const quote = vi.fn(async () => answer);
  const provider = { searchDestinations: vi.fn(), quote } as unknown as ShippingProvider;
  const cache = createMemoryCache(() => NOW);
  const run = (over: Partial<{ rules: ShopRules; input: QuoteInput; secret: string }> = {}) => quoteShipping({ provider, cache, rules: over.rules ?? rules, input: over.input ?? input, secret: over.secret ?? SECRET, now: () => NOW });
  return { quote, cache, run };
}

describe("bucketWeight", () => {
  it("rounds up to the next step", () => {
    expect(WEIGHT_STEP).toBe(100);
    expect(bucketWeight(1)).toBe(100);
    expect(bucketWeight(100)).toBe(100);
    expect(bucketWeight(101)).toBe(200);
    expect(bucketWeight(1300)).toBe(1300);
    expect(bucketWeight(1301)).toBe(1400);
  });
});

describe("a good quote", () => {
  it("asks the provider for the cart's whole weight (rounded up), from the shop's place to the buyer's, with the shop's couriers", async () => {
    const { quote, run } = setup();
    await run();
    expect(quote).toHaveBeenCalledTimes(1);
    expect(quote).toHaveBeenCalledWith({ originId: 17549, destinationId: 17536, weightGram: 1300, couriers: ["jne", "sicepat"] });
  });
  it("offers the parcel services, cheapest first, with the weight and total it worked from", async () => {
    const { run } = setup();
    const result = await run();
    expect(result.ok && result.options.map((o) => `${o.courier}:${o.service}:${o.fee}`)).toEqual(["anteraja:ECO:7100", "sicepat:REG:8000", "jne:CTC:10000"]);
    expect(result.ok && [result.weightGram, result.subtotal, result.freeShipping]).toEqual([1300, 307000, false]);
  });
  it("signs each service for this buyer, this trip, this weight, and this price, good for half an hour", async () => {
    const { run } = setup();
    const result = await run();
    if (!result.ok) throw new Error("expected options");
    for (const option of result.options) {
      const check = await verifyQuote(option.token, SECRET, NOW / 1000);
      expect(check).toMatchObject({ ok: true, payload: { u: "buyer-1", o: 17549, d: 17536, w: 1300, c: option.courier, v: option.service, f: option.fee, e: option.etd, x: NOW / 1000 + QUOTE_TTL_SECONDS } });
    }
    const first = result.options[0];
    expect(await verifyQuote(first.token, SECRET, NOW / 1000 + QUOTE_TTL_SECONDS)).toEqual({ ok: false, error: "expired" });
    expect(await verifyQuote(first.token, "another secret", NOW / 1000)).toMatchObject({ ok: false });
  });
  it("adds the markup to what the buyer pays and signs that price, not the courier's", async () => {
    const { run } = setup();
    const result = await run({ rules: { ...rules, markup: 2000 } });
    if (!result.ok) throw new Error("expected options");
    expect(result.options[0].fee).toBe(9100);
    expect(await verifyQuote(result.options[0].token, SECRET, NOW / 1000)).toMatchObject({ payload: { f: 9100 } });
  });
});

describe("free shipping", () => {
  it("applies from the minimum, counting price times quantity, and not below it", async () => {
    const { run } = setup();
    const at = await run({ rules: { ...rules, freeShippingMin: 307000 } });
    expect(at.ok && [at.freeShipping, at.options[0].fee, at.options[1].fee]).toEqual([true, 0, 900]);
    const below = await run({ rules: { ...rules, freeShippingMin: 307001 } });
    expect(below.ok && [below.freeShipping, below.options[0].fee]).toEqual([false, 7100]);
  });
  it("applies from a minimum of zero to every order, and never when there is no minimum", async () => {
    const { run } = setup();
    expect((await run({ rules: { ...rules, freeShippingMin: 0 } }))).toMatchObject({ ok: true, freeShipping: true });
    expect((await run({ rules: { ...rules, freeShippingMin: null } }))).toMatchObject({ ok: true, freeShipping: false });
  });
});

describe("the cache", () => {
  it("asks the provider once for the same trip and weight, even with the couriers in another order or a cart that weighs a little less", async () => {
    const { quote, run } = setup();
    await run();
    await run({ rules: { ...rules, couriers: ["sicepat", "jne", "jne"] } });
    await run({ input: { ...input, lines: [{ weightGram: 500, price: 89000, qty: 2 }, { weightGram: 250, price: 129000, qty: 1 }] } });
    expect(quote).toHaveBeenCalledTimes(1);
  });
  it("applies the shop's rules to the cached answer, so changing them needs no new hit", async () => {
    const { quote, run } = setup();
    await run();
    const result = await run({ rules: { ...rules, markup: 500 } });
    expect(quote).toHaveBeenCalledTimes(1);
    expect(result.ok && result.options[0].fee).toBe(7600);
  });
  it("asks again for another place, another weight bucket, other couriers, or another shop place", async () => {
    const { quote, run } = setup();
    await run();
    await run({ input: { ...input, destinationId: 1 } });
    await run({ input: { ...input, lines: [{ weightGram: 2000, price: 1, qty: 1 }] } });
    await run({ rules: { ...rules, couriers: ["jne"] } });
    await run({ rules: { ...rules, originId: 5 } });
    expect(quote).toHaveBeenCalledTimes(5);
  });
  it("keeps what the provider said for ten minutes, filed under the trip, the weight bucket, and the couriers", async () => {
    const { cache, run } = setup();
    const set = vi.spyOn(cache, "set");
    await run();
    expect(RATES_TTL_SECONDS).toBe(600);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("rates:17549:17536:1300:jne,sicepat", JSON.stringify(RATES), 600);
  });
  it("does not remember a failure, and asks again when what is cached is damaged", async () => {
    const failing = setup({ ok: false, error: "quota" });
    expect(await failing.run()).toEqual({ ok: false, error: "quota" });
    expect(await failing.cache.get("rates:17549:17536:1300:jne,sicepat")).toBeNull();
    for (const damaged of ["{not json", JSON.stringify({ not: "a list" }), JSON.stringify([{ courier: 1 }]), JSON.stringify([null])]) {
      const s = setup();
      await s.cache.set("rates:17549:17536:1300:jne,sicepat", damaged, 60);
      expect(await s.run()).toMatchObject({ ok: true });
      expect(s.quote).toHaveBeenCalledTimes(1);
    }
  });
});

describe("what cannot be quoted", () => {
  it("says there is no secret to sign with, and spends no hit", async () => {
    const { quote, run } = setup();
    expect(await run({ secret: "" })).toEqual({ ok: false, error: "notConfigured" });
    expect(quote).not.toHaveBeenCalled();
  });
  it("says the shop has not said where parcels leave from, and spends no hit", async () => {
    const { quote, run } = setup();
    expect(await run({ rules: { ...rules, originId: null } })).toEqual({ ok: false, error: "originMissing" });
    expect(quote).not.toHaveBeenCalled();
  });
  it("refuses a cart that is empty, or has a weight, price, or quantity that is not a whole positive number, or a place that is not valid, and spends no hit", async () => {
    const { quote, run } = setup();
    const line = { weightGram: 500, price: 1000, qty: 1 };
    for (const bad of [{ ...input, lines: [] }, { ...input, lines: [{ ...line, weightGram: 0 }] }, { ...input, lines: [{ ...line, weightGram: 1.5 }] }, { ...input, lines: [{ ...line, price: -1 }] }, { ...input, lines: [{ ...line, price: 1.5 }] }, { ...input, lines: [{ ...line, qty: 0 }] }, { ...input, lines: [{ ...line, qty: 1.5 }] }, { ...input, destinationId: 0 }, { ...input, destinationId: 1.5 }, { ...input, lines: [{ weightGram: Number.MAX_SAFE_INTEGER, price: 1, qty: 2 }] }, { ...input, lines: [{ weightGram: 1, price: Number.MAX_SAFE_INTEGER, qty: 2 }] }]) {
      expect(await run({ input: bad })).toEqual({ ok: false, error: "invalid" });
    }
    expect(quote).not.toHaveBeenCalled();
  });
  it("accepts a price of zero", async () => {
    const { run } = setup();
    expect(await run({ input: { ...input, lines: [{ weightGram: 500, price: 0, qty: 1 }] } })).toMatchObject({ ok: true, subtotal: 0 });
  });
  it("says there is no parcel service for a cart that is too heavy for one, without asking, and takes a cart of exactly the limit", async () => {
    const { quote, run } = setup();
    expect(await run({ input: { ...input, lines: [{ weightGram: MAX_PARCEL_GRAMS + 1, price: 1, qty: 1 }] } })).toEqual({ ok: false, error: "noRates" });
    expect(quote).not.toHaveBeenCalled();
    expect(await run({ input: { ...input, lines: [{ weightGram: MAX_PARCEL_GRAMS, price: 1, qty: 1 }] } })).toMatchObject({ ok: true, weightGram: MAX_PARCEL_GRAMS });
  });
  it("says there is no parcel service when the provider has only freight for that trip, or nothing at all", async () => {
    expect(await setup({ ok: true, value: [rate("jne", "JTR", 40000, { description: "JNE Trucking" })] }).run()).toEqual({ ok: false, error: "noRates" });
    expect(await setup({ ok: true, value: [] }).run()).toEqual({ ok: false, error: "noRates" });
  });
  it("passes on that the day's free hits are used up, and says anything else the provider did wrong is 'not available'", async () => {
    expect(await setup({ ok: false, error: "quota" }).run()).toEqual({ ok: false, error: "quota" });
    expect(await setup({ ok: false, error: "notConfigured" }).run()).toEqual({ ok: false, error: "notConfigured" });
    for (const error of ["unavailable", "rejected", "invalid"] as const) expect(await setup({ ok: false, error }).run()).toEqual({ ok: false, error: "unavailable" });
  });
});
