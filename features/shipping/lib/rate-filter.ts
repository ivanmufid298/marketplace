import type { ProviderRate } from "./types";

// Which of the provider's services a buyer is offered, and what each one costs the buyer. The provider answers with every service a
// courier has, including freight, frozen goods, and documents; a parcel shop offers the parcel services only.

/** Services (by the provider's code, in capitals) that are not for an ordinary parcel: freight, frozen, documents. */
const NOT_PARCEL_CODES = new Set(["GOKIL", "MIC", "BIG", "ICE", "DOK", "JTR", "JTR<130", "JTR>130", "JTR>200"]);
const NOT_PARCEL_WORDS = /cargo|trucking|frozen|document|dokumen|freight/i;

/** An ordinary parcel service: not freight, not frozen goods, not a document service. */
export const isParcelService = (rate: Pick<ProviderRate, "service" | "description">) => !NOT_PARCEL_CODES.has(rate.service.trim().toUpperCase()) && !NOT_PARCEL_WORDS.test(rate.description);

/** A service as the buyer is offered it: its price already includes the shop's markup and any free shipping. */
export type PricedOption = ProviderRate & {
  /** What the buyer pays, in rupiah. */
  fee: number;
  /** What the courier asked, before the shop's markup and free shipping. */
  courierFee: number;
};

/** The most services offered at once: more than that is a list nobody reads. */
export const MAX_OPTIONS = 10;

/**
 * The parcel services of the answer, priced for the buyer, cheapest first. The shop's markup (or discount) is added to each, and never
 * takes a price below zero. When shipping is free for this order the cheapest service costs nothing and each other one only its
 * difference from it, so a buyer who wants something faster pays for the faster part, not the whole.
 * The same service twice (it happens) is kept once, at its lower price.
 */
export function priceOptions(rates: ProviderRate[], { markup, freeShipping }: { markup: number; freeShipping: boolean }): PricedOption[] {
  const bestOf = new Map<string, ProviderRate>();
  for (const rate of rates.filter(isParcelService)) {
    const key = `${rate.courier}:${rate.service.toUpperCase()}`;
    const seen = bestOf.get(key);
    if (!seen || rate.fee < seen.fee) bestOf.set(key, rate);
  }
  const withMarkup = [...bestOf.values()].map((rate) => ({ rate, price: Math.max(0, rate.fee + markup) }));
  const floor = freeShipping && withMarkup.length > 0 ? Math.min(...withMarkup.map((o) => o.price)) : 0;
  return withMarkup
    .map(({ rate, price }) => ({ ...rate, fee: price - floor, courierFee: rate.fee }))
    .sort((a, b) => a.fee - b.fee || a.courierFee - b.courierFee || a.courierName.localeCompare(b.courierName) || a.service.localeCompare(b.service))
    .slice(0, MAX_OPTIONS);
}
