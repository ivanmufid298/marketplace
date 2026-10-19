// Run with `npm run test:ui`. What the address search answers to the browser, and to whom.
import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "./cache";
import { answerDestinationSearch } from "./handlers";
import type { Destination, ProviderError, ShippingProvider } from "./types";

const place: Destination = { id: 1, label: "KEBAYORAN BARU", province: "P", city: "C", district: "D", subdistrict: "S", postcode: "12150" };
const provider = (answer: { ok: true; value: Destination[] } | { ok: false; error: ProviderError }) => {
  const search = vi.fn(async () => answer);
  return { provider: { searchDestinations: search, quote: vi.fn() } as ShippingProvider, search };
};
const ask = (p: ShippingProvider, over: { query?: string | null; signedIn?: boolean } = {}) => answerDestinationSearch({ query: "kebayoran", signedIn: true, provider: p, cache: createMemoryCache(), ...over });

describe("the address search answer", () => {
  it("lists the places for a signed-in buyer", async () => {
    expect(await ask(provider({ ok: true, value: [place] }).provider)).toEqual({ status: 200, body: { destinations: [place] } });
  });
  it("turns away someone who is not signed in, without spending a hit", async () => {
    const { provider: p, search } = provider({ ok: true, value: [place] });
    expect(await ask(p, { signedIn: false })).toEqual({ status: 401, body: { error: "signIn" } });
    expect(search).not.toHaveBeenCalled();
  });
  it("says a search is too short, also when there is none at all", async () => {
    const { provider: p, search } = provider({ ok: true, value: [] });
    expect(await ask(p, { query: "ab" })).toEqual({ status: 400, body: { error: "tooShort" } });
    expect(await ask(p, { query: null })).toEqual({ status: 400, body: { error: "tooShort" } });
    expect(search).not.toHaveBeenCalled();
  });
  it("says when the day's free hits are used up, and when there is no key", async () => {
    expect(await ask(provider({ ok: false, error: "quota" }).provider)).toEqual({ status: 429, body: { error: "quota" } });
    expect(await ask(provider({ ok: false, error: "notConfigured" }).provider)).toEqual({ status: 503, body: { error: "notConfigured" } });
  });
  it("says only 'not available' when the provider is down or refused us, so nothing about our key or theirs leaks", async () => {
    for (const error of ["unavailable", "rejected", "invalid"] as const) expect(await ask(provider({ ok: false, error }).provider)).toEqual({ status: 503, body: { error: "unavailable" } });
  });
});
