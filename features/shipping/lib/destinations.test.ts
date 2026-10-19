// Run with `npm run test:ui`. Searching places: what is worth asking, and that the provider is asked only once per search.
import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "./cache";
import { FOUND_TTL_SECONDS, MAX_QUERY_LENGTH, NOTHING_TTL_SECONDS, normalizeQuery, RESULT_LIMIT, searchDestinations } from "./destinations";
import type { Destination, ProviderResult, ShippingProvider } from "./types";

const place = (id: number): Destination => ({ id, label: `Tempat ${id}`, province: "P", city: "C", district: "D", subdistrict: "S", postcode: "12345" });
const provider = (answer: ProviderResult<Destination[]>): ShippingProvider & { search: ReturnType<typeof vi.fn> } => {
  const search = vi.fn(async () => answer);
  return { searchDestinations: search, quote: vi.fn(), search } as never;
};

describe("normalizeQuery", () => {
  it("trims, lowers the case, and keeps single spaces", () => expect(normalizeQuery("  Kebayoran   BARU ")).toBe("kebayoran baru"));
  it("keeps letters, digits, spaces, and hyphens only", () => {
    expect(normalizeQuery("Jl. Mawar #1, Jakarta")).toBe("jl mawar 1 jakarta");
    expect(normalizeQuery("Kota-Baru 12240")).toBe("kota-baru 12240");
  });
  it("is null when it is too short or too long to be worth asking", () => {
    expect(normalizeQuery("ab")).toBeNull();
    expect(normalizeQuery("  a b ")).toBeNull();
    expect(normalizeQuery("abc")).toBe("abc");
    expect(normalizeQuery("x".repeat(MAX_QUERY_LENGTH))).toBe("x".repeat(MAX_QUERY_LENGTH));
    expect(normalizeQuery("x".repeat(MAX_QUERY_LENGTH + 1))).toBeNull();
    expect(normalizeQuery("!!!")).toBeNull();
  });
  it("treats a postcode as a search like any other", () => expect(normalizeQuery("12240")).toBe("12240"));
});

describe("searchDestinations", () => {
  it("asks the provider with the cleaned search and the usual limit, and says it was not from the cache", async () => {
    const p = provider({ ok: true, value: [place(1)] });
    const result = await searchDestinations(p, createMemoryCache(), "  Kebayoran  Baru ");
    expect(result).toEqual({ ok: true, value: [place(1)], cached: false });
    expect(p.search).toHaveBeenCalledWith("kebayoran baru", RESULT_LIMIT);
  });
  it("does not ask the provider again for the same search, however it was typed", async () => {
    const p = provider({ ok: true, value: [place(1)] });
    const cache = createMemoryCache();
    await searchDestinations(p, cache, "Kebayoran Baru");
    const again = await searchDestinations(p, cache, "  kebayoran   baru");
    expect(again).toEqual({ ok: true, value: [place(1)], cached: true });
    expect(p.search).toHaveBeenCalledTimes(1);
  });
  it("does not ask at all for a search that is too short", async () => {
    const p = provider({ ok: true, value: [] });
    expect(await searchDestinations(p, createMemoryCache(), "ab")).toEqual({ ok: false, error: "tooShort" });
    expect(p.search).not.toHaveBeenCalled();
  });
  it("passes the reason on when the provider cannot answer, and remembers nothing of it", async () => {
    const cache = createMemoryCache();
    const failing = provider({ ok: false, error: "quota" });
    expect(await searchDestinations(failing, cache, "jakarta")).toEqual({ ok: false, error: "quota" });
    const working = provider({ ok: true, value: [place(2)] });
    expect(await searchDestinations(working, cache, "jakarta")).toMatchObject({ ok: true, cached: false });
  });
  it("keeps what was found for a month and finding nothing for a day", async () => {
    const sets: [string, number][] = [];
    const cache = { get: async () => null, set: async (k: string, _v: string, ttl: number) => void sets.push([k, ttl]) };
    await searchDestinations(provider({ ok: true, value: [place(1)] }), cache, "jakarta");
    await searchDestinations(provider({ ok: true, value: [] }), cache, "zzzz");
    expect(sets).toEqual([["dest:jakarta", FOUND_TTL_SECONDS], ["dest:zzzz", NOTHING_TTL_SECONDS]]);
  });
  it("asks again when what is in the cache is damaged", async () => {
    const p = provider({ ok: true, value: [place(3)] });
    for (const damaged of ["{not json", JSON.stringify({ not: "a list" }), JSON.stringify([{ id: "x" }]), JSON.stringify([null])]) {
      const cache = createMemoryCache();
      await cache.set("dest:jakarta", damaged, 60);
      expect(await searchDestinations(p, cache, "jakarta")).toMatchObject({ ok: true, value: [place(3)], cached: false });
    }
  });
});
