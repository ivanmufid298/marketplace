// Run with `npm run test:ui`. Searching places as the buyer types: when it asks, how often, and what it shows meanwhile.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDestinations, forgetDestinations, useDestinationSearch } from "./use-destination-search";
import type { Destination } from "./types";

const place = (id: number): Destination => ({ id, label: `TEMPAT ${id}`, province: "P", city: "C", district: "D", subdistrict: "S", postcode: "12345" });
const answer = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
const asFetch = (fn: unknown) => fn as typeof fetch;

beforeEach(() => forgetDestinations());
afterEach(cleanup);

describe("fetchDestinations", () => {
  it("asks the shop's own address, with the search encoded, and returns the places", async () => {
    const fetchImpl = vi.fn(answer({ destinations: [place(1)] }));
    expect(await fetchDestinations("kebayoran baru", asFetch(fetchImpl))).toEqual({ ok: true, value: [place(1)] });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("/api/shipping/destinations?q=kebayoran%20baru");
  });
  it("drops entries that are not places", async () => {
    const r = await fetchDestinations("jakarta", asFetch(answer({ destinations: [place(1), { id: "x" }, null, "y"] })));
    expect(r).toEqual({ ok: true, value: [place(1)] });
  });
  it("names the reason the server gave", async () => {
    for (const error of ["signIn", "quota", "unavailable", "notConfigured"] as const) expect(await fetchDestinations("jakarta", asFetch(answer({ error }, 503)))).toEqual({ ok: false, error });
  });
  it("says 'sign in' for a 401 with no reason, and 'failed' for anything it does not understand", async () => {
    expect(await fetchDestinations("jakarta", asFetch(answer({}, 401)))).toEqual({ ok: false, error: "signIn" });
    expect(await fetchDestinations("jakarta", asFetch(answer({ error: "weird" }, 500)))).toEqual({ ok: false, error: "failed" });
    expect(await fetchDestinations("jakarta", asFetch(async () => new Response("<html>", { status: 502 })))).toEqual({ ok: false, error: "failed" });
    expect(await fetchDestinations("jakarta", asFetch(answer({ destinations: "nope" })))).toEqual({ ok: false, error: "failed" });
  });
  it("says 'failed' when the connection fails", async () => {
    expect(await fetchDestinations("jakarta", asFetch(async () => { throw new Error("offline"); }))).toEqual({ ok: false, error: "failed" });
  });
});

describe("useDestinationSearch", () => {
  const search = (query: string, fetchImpl: unknown) => renderHook(({ q }) => useDestinationSearch(q, { fetchImpl: asFetch(fetchImpl), debounceMs: 10 }), { initialProps: { q: query } });

  it("does nothing for a search that is too short", async () => {
    const fetchImpl = vi.fn(answer({ destinations: [] }));
    const view = search("ab", fetchImpl);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(view.result.current).toEqual({ status: "idle", results: [], error: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("says it is searching, then shows the places", async () => {
    const view = search("jakarta", answer({ destinations: [place(1), place(2)] }));
    expect(view.result.current.status).toBe("loading");
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(view.result.current.results.map((d) => d.id)).toEqual([1, 2]);
  });
  it("waits for the buyer to pause, asking once for what was finally typed", async () => {
    const fetchImpl = vi.fn(answer({ destinations: [place(1)] }));
    const view = search("jak", fetchImpl);
    view.rerender({ q: "jakar" });
    view.rerender({ q: "jakarta" });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain("q=jakarta");
  });
  it("does not ask again for words it has already been told, however they are typed", async () => {
    const fetchImpl = vi.fn(answer({ destinations: [place(1)] }));
    const first = search("Jakarta Selatan", fetchImpl);
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();
    const second = search("  jakarta   selatan ", fetchImpl);
    expect(second.result.current.status).toBe("ready");
    expect(second.result.current.results).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("shows nothing of the older search while the newer one is on its way", async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify({ destinations: [place(url.includes("bandung") ? 2 : 1)] })));
    const view = search("jakarta", fetchImpl);
    await waitFor(() => expect(view.result.current.results.map((d) => d.id)).toEqual([1]));
    view.rerender({ q: "bandung" });
    expect(view.result.current).toMatchObject({ status: "loading", results: [] });
    await waitFor(() => expect(view.result.current.results.map((d) => d.id)).toEqual([2]));
  });
  it("ignores a slow answer to a search that has been replaced", async () => {
    const resolvers: Record<string, (r: Response) => void> = {};
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const key = /q=(\w+)/.exec(url)![1];
      resolvers[key] = resolve;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const view = search("jakarta", fetchImpl);
    await waitFor(() => expect(resolvers.jakarta).toBeDefined());
    view.rerender({ q: "bandung" });
    await waitFor(() => expect(resolvers.bandung).toBeDefined());
    await act(async () => { resolvers.jakarta(new Response(JSON.stringify({ destinations: [place(1)] }))); });
    expect(view.result.current.status).toBe("loading");
    await act(async () => { resolvers.bandung(new Response(JSON.stringify({ destinations: [place(2)] }))); });
    await waitFor(() => expect(view.result.current.results.map((d) => d.id)).toEqual([2]));
  });
  it("calls off the request for a search that has been replaced, so it does not run on for nothing", async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>(() => { if (init?.signal) signals.push(init.signal); }));
    const view = search("jakarta", fetchImpl);
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);
    view.rerender({ q: "bandung" });
    expect(signals[0].aborted).toBe(true);
    await waitFor(() => expect(signals).toHaveLength(2));
    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });
  it("reports why when the search cannot be used, and does not remember a failure", async () => {
    const fetchImpl = vi.fn(answer({ error: "quota" }, 429));
    const view = search("jakarta", fetchImpl);
    await waitFor(() => expect(view.result.current).toEqual({ status: "error", results: [], error: "quota" }));
    view.unmount();
    const again = search("jakarta", answer({ destinations: [place(1)] }));
    await waitFor(() => expect(again.result.current.status).toBe("ready"));
  });
  it("remembers an empty answer too, so a search with no result is not repeated", async () => {
    const fetchImpl = vi.fn(answer({ destinations: [] }));
    const first = search("zzzz", fetchImpl);
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    first.unmount();
    search("zzzz", fetchImpl);
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("stops asking when the buyer clears the box", async () => {
    const view = search("jakarta", answer({ destinations: [place(1)] }));
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    view.rerender({ q: "" });
    expect(view.result.current).toEqual({ status: "idle", results: [], error: null });
  });
});
