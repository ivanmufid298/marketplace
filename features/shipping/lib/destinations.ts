import type { Cache } from "./cache";
import type { Destination, ProviderError, ShippingProvider } from "./types";

export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 60;
/** Places hardly ever change, so what was found stays for a month; finding nothing is remembered for a day (it may be a typo). */
export const FOUND_TTL_SECONDS = 30 * 24 * 3600;
export const NOTHING_TTL_SECONDS = 24 * 3600;
export const RESULT_LIMIT = 8;

/** The search as it is asked of the provider and filed in the cache: trimmed, lower case, single spaces. Null when it is not worth asking. */
export function normalizeQuery(raw: string): string | null {
  const q = raw.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  // Counted without spaces: "a b" is not a place and would only spend one of the day's free hits.
  return q.replace(/\s/g, "").length >= MIN_QUERY_LENGTH && q.length <= MAX_QUERY_LENGTH ? q : null;
}

const isDestination = (x: unknown): x is Destination =>
  typeof x === "object" && x !== null && typeof (x as Destination).id === "number" && typeof (x as Destination).label === "string";

export type SearchResult = { ok: true; value: Destination[]; cached: boolean } | { ok: false; error: "tooShort" | ProviderError };

/** Searches places by name or postcode, asking the provider only when the cache has not seen the search before. */
export async function searchDestinations(provider: ShippingProvider, cache: Cache, raw: string): Promise<SearchResult> {
  const query = normalizeQuery(raw);
  if (!query) return { ok: false, error: "tooShort" };
  const key = `dest:${query}`;
  const hit = await cache.get(key);
  if (hit) {
    try {
      const parsed: unknown = JSON.parse(hit);
      if (Array.isArray(parsed) && parsed.every(isDestination)) return { ok: true, value: parsed, cached: true };
    } catch {
      // A damaged entry is asked for again.
    }
  }
  const result = await provider.searchDestinations(query, RESULT_LIMIT);
  if (!result.ok) return result;
  await cache.set(key, JSON.stringify(result.value), result.value.length > 0 ? FOUND_TTL_SECONDS : NOTHING_TTL_SECONDS);
  return { ok: true, value: result.value, cached: false };
}
