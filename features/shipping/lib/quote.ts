import type { Cache } from "./cache";
import { priceOptions } from "./rate-filter";
import { QUOTE_TTL_SECONDS, signQuote } from "./quote-token";
import type { ProviderRate, ShippingProvider } from "./types";

/** One kind of product in the cart, as the database knows it: its weight and price, and how many. */
export type QuoteLine = { weightGram: number; price: number; qty: number };

/** The shop's rules for pricing shipping. */
export type ShopRules = { originId: number | null; couriers: string[]; freeShippingMin: number | null; markup: number };

/** A service the buyer can choose, with the signed token that lets the order be placed at exactly this price. */
export type QuoteOption = { courier: string; courierName: string; service: string; description: string; fee: number; etd: string; token: string };

export type QuoteError = "originMissing" | "noRates" | "quota" | "unavailable" | "notConfigured" | "invalid";
export type QuoteResult = { ok: true; options: QuoteOption[]; weightGram: number; subtotal: number; freeShipping: boolean } | { ok: false; error: QuoteError };

/** Weights are priced in steps of this many grams (rounded up), so carts that weigh nearly the same share one answer from the provider. */
export const WEIGHT_STEP = 100;
/** Heavier than this is not a parcel; no parcel service is asked. */
export const MAX_PARCEL_GRAMS = 100_000;
/** How long what the provider said is kept. */
export const RATES_TTL_SECONDS = 10 * 60;

export const bucketWeight = (grams: number) => Math.ceil(grams / WEIGHT_STEP) * WEIGHT_STEP;

const isRate = (x: unknown): x is ProviderRate =>
  typeof x === "object" && x !== null && typeof (x as ProviderRate).courier === "string" && typeof (x as ProviderRate).service === "string" && typeof (x as ProviderRate).fee === "number" && typeof (x as ProviderRate).courierName === "string";

export type QuoteInput = { userId: string; destinationId: number; lines: QuoteLine[] };

/**
 * Prices the cart's shipping to a place for a signed-in buyer: the weight and the total come from the lines (read from the database
 * by the caller, never taken from the browser), the provider is asked only when the cache has not just been told the same, and each
 * service offered carries a signed token for the order.
 */
export async function quoteShipping(args: { provider: ShippingProvider; cache: Cache; rules: ShopRules; input: QuoteInput; secret: string; now?: () => number }): Promise<QuoteResult> {
  const { provider, cache, rules, input, secret } = args;
  const now = args.now ?? Date.now;
  // Without a secret nothing can be signed, so nothing is asked (a hit is not spent on an answer that cannot be used).
  if (!secret) return { ok: false, error: "notConfigured" };
  if (rules.originId === null) return { ok: false, error: "originMissing" };
  const { lines } = input;
  if (lines.length === 0 || !Number.isSafeInteger(input.destinationId) || input.destinationId <= 0 || lines.some((l) => !(Number.isSafeInteger(l.weightGram) && l.weightGram > 0 && Number.isSafeInteger(l.price) && l.price >= 0 && Number.isSafeInteger(l.qty) && l.qty > 0))) return { ok: false, error: "invalid" };

  const grams = lines.reduce((sum, l) => sum + l.weightGram * l.qty, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  if (!Number.isSafeInteger(grams) || !Number.isSafeInteger(subtotal)) return { ok: false, error: "invalid" };
  if (grams > MAX_PARCEL_GRAMS) return { ok: false, error: "noRates" };
  const weightGram = bucketWeight(grams);

  const couriers = [...new Set(rules.couriers)].sort();
  const key = `rates:${rules.originId}:${input.destinationId}:${weightGram}:${couriers.join(",")}`;
  let rates: ProviderRate[] | null = null;
  const hit = await cache.get(key);
  if (hit) {
    try {
      const parsed: unknown = JSON.parse(hit);
      if (Array.isArray(parsed) && parsed.every(isRate)) rates = parsed;
    } catch {
      // A damaged entry is asked for again.
    }
  }
  if (!rates) {
    const result = await provider.quote({ originId: rules.originId, destinationId: input.destinationId, weightGram, couriers });
    if (!result.ok) return { ok: false, error: result.error === "quota" ? "quota" : result.error === "notConfigured" ? "notConfigured" : "unavailable" };
    rates = result.value;
    await cache.set(key, JSON.stringify(rates), RATES_TTL_SECONDS);
  }

  const freeShipping = rules.freeShippingMin !== null && subtotal >= rules.freeShippingMin;
  const priced = priceOptions(rates, { markup: rules.markup, freeShipping });
  if (priced.length === 0) return { ok: false, error: "noRates" };
  const expires = Math.floor(now() / 1000) + QUOTE_TTL_SECONDS;
  const options: QuoteOption[] = await Promise.all(
    priced.map(async (o) => ({
      courier: o.courier,
      courierName: o.courierName,
      service: o.service,
      description: o.description,
      fee: o.fee,
      etd: o.etd,
      token: await signQuote({ u: input.userId, o: rules.originId as number, d: input.destinationId, w: weightGram, c: o.courier, v: o.service, f: o.fee, e: o.etd, x: expires }, secret),
    })),
  );
  return { ok: true, options, weightGram, subtotal, freeShipping };
}
