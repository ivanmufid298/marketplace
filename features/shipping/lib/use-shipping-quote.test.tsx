// Run with `npm run test:ui`. Asking for courier prices: once per distinct cart and place, never showing an older answer, and giving up
// after a while so the checkout can offer the shop's own rates.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchQuote, useShippingQuote } from "./use-shipping-quote";

const OPTION = { courier: "jne", courierName: "JNE", service: "REG", description: "Reguler", fee: 9000, etd: "2 day", token: "t" };
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("fetchQuote", () => {
  it("returns the options, asking with the place and the cart only", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    expect(await fetchQuote(5, [{ productId: 1, qty: 2 }], f as unknown as typeof fetch)).toEqual({ options: [OPTION] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/shipping/quote");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ destinationId: 5, items: [{ productId: 1, qty: 2 }] });
  });
  it("drops options that are not options, and says there are no rates when none is left", async () => {
    expect(await fetchQuote(5, [], (() => answer(200, { options: [OPTION, { fee: "free" }] })) as unknown as typeof fetch)).toEqual({ options: [OPTION] });
    expect(await fetchQuote(5, [], (() => answer(200, { options: [{ fee: "free" }] })) as unknown as typeof fetch)).toEqual({ error: "noRates" });
    expect(await fetchQuote(5, [], (() => answer(200, { options: [] })) as unknown as typeof fetch)).toEqual({ error: "noRates" });
  });
  it.each(["signIn", "originMissing", "noRates", "quota", "unavailable", "notConfigured", "invalid"])("passes on the reason %s", async (error) => {
    expect(await fetchQuote(5, [], (() => answer(503, { error })) as unknown as typeof fetch)).toEqual({ error });
  });
  it.each(["token", "fee", "etd", "courier", "courierName", "service", "description"])("drops an option that has no usable %s", async (field) => {
    const broken = { ...OPTION, [field]: field === "fee" ? "9000" : 5 };
    expect(await fetchQuote(5, [], (() => answer(200, { options: [OPTION, broken] })) as unknown as typeof fetch)).toEqual({ options: [OPTION] });
    const without: Record<string, unknown> = { ...OPTION }; delete without[field];
    expect(await fetchQuote(5, [], (() => answer(200, { options: [without] })) as unknown as typeof fetch)).toEqual({ error: "noRates" });
  });
  it("does not take options from an answer that says it failed", async () => {
    expect(await fetchQuote(5, [], (() => answer(500, { options: [OPTION] })) as unknown as typeof fetch)).toEqual({ error: "failed" });
  });
  it("calls an unknown reason, a broken answer, and a failed request 'failed' (a 401 is a sign-in)", async () => {
    expect(await fetchQuote(5, [], (() => answer(500, { error: "weird" })) as unknown as typeof fetch)).toEqual({ error: "failed" });
    expect(await fetchQuote(5, [], (() => Promise.resolve(new Response("<html>", { status: 502 }))) as unknown as typeof fetch)).toEqual({ error: "failed" });
    expect(await fetchQuote(5, [], (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toEqual({ error: "failed" });
    expect(await fetchQuote(5, [], (() => Promise.resolve(new Response("", { status: 401 }))) as unknown as typeof fetch)).toEqual({ error: "signIn" });
  });
});

describe("useShippingQuote", () => {
  const items = [{ productId: 2, qty: 1 }, { productId: 1, qty: 3 }];

  it("asks nothing when it is not wanted, there is no place, or the cart is empty", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    for (const args of [[5, items, false], [null, items, true], [5, [], true]] as const) {
      const { result } = renderHook(() => useShippingQuote(args[0], [...args[1]], args[2], { fetchImpl: f as unknown as typeof fetch }));
      expect(result.current.status).toBe("idle");
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("goes from loading to ready with the options", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    const { result } = renderHook(() => useShippingQuote(5, items, true, { fetchImpl: f as unknown as typeof fetch }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.options).toEqual([OPTION]);
    expect(result.current.error).toBeNull();
  });

  it("does not ask again for the same cart in another order, or for a re-render", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    const { result, rerender } = renderHook(({ list }) => useShippingQuote(5, list, true, { fetchImpl: f as unknown as typeof fetch }), { initialProps: { list: items } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ list: [...items].reverse() });
    rerender({ list: items.map((i) => ({ ...i })) });
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("asks again when the place or the quantity changes, and does not show the old answer meanwhile", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    const { result, rerender } = renderHook(({ place, list }) => useShippingQuote(place, list, true, { fetchImpl: f as unknown as typeof fetch }), { initialProps: { place: 5, list: items } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ place: 6, list: items });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ place: 6, list: [{ productId: 2, qty: 2 }, { productId: 1, qty: 3 }] });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("shows the answer to the latest question when an older one comes in later", async () => {
    let first: (r: Response) => void = () => undefined;
    const f = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { first = resolve; }))
      .mockImplementationOnce(() => answer(200, { options: [{ ...OPTION, token: "new" }] }));
    const { result, rerender } = renderHook(({ place }) => useShippingQuote(place, items, true, { fetchImpl: f as unknown as typeof fetch }), { initialProps: { place: 5 } });
    rerender({ place: 6 });
    await waitFor(() => expect(result.current.options[0]?.token).toBe("new"));
    await act(async () => { first(new Response(JSON.stringify({ options: [{ ...OPTION, token: "old" }] }))); });
    expect(result.current.options[0].token).toBe("new");
  });

  it("calls off the question that is no longer being asked", async () => {
    const signals: AbortSignal[] = [];
    const f = vi.fn((_url: string, init?: RequestInit) => { signals.push(init?.signal as AbortSignal); return answer(200, { options: [OPTION] }); });
    const { rerender, unmount } = renderHook(({ place }) => useShippingQuote(place, items, true, { fetchImpl: f as unknown as typeof fetch }), { initialProps: { place: 5 } });
    expect(signals[0].aborted).toBe(false);
    rerender({ place: 6 });
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("asks again on refresh", async () => {
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    const { result } = renderHook(() => useShippingQuote(5, items, true, { fetchImpl: f as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.refresh());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("reports why when the answer is an error", async () => {
    const f = vi.fn(() => answer(429, { error: "quota" }));
    const { result } = renderHook(() => useShippingQuote(5, items, true, { fetchImpl: f as unknown as typeof fetch }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("quota");
    expect(result.current.options).toEqual([]);
  });

  it("gives up after the time allowed, and a late answer then changes nothing", async () => {
    vi.useFakeTimers();
    let late: (r: Response) => void = () => undefined;
    const f = vi.fn(() => new Promise<Response>((resolve) => { late = resolve; }));
    const { result } = renderHook(() => useShippingQuote(5, items, true, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 1000 }));
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(result.current.status).toBe("loading");
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(result.current).toMatchObject({ status: "error", error: "failed" });
    await act(async () => { late(new Response(JSON.stringify({ options: [OPTION] }))); });
    expect(result.current.status).toBe("error");
  });

  it("lets an abandoned question's clock run out without touching the question asked since", async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>(() => undefined)) // place 5, never answered
      .mockImplementation(() => answer(200, { options: [OPTION] }));
    const { result, rerender } = renderHook(({ place }) => useShippingQuote(place, items, true, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 1000 }), { initialProps: { place: 5 } });
    await act(async () => { vi.advanceTimersByTime(400); });
    rerender({ place: 6 });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    rerender({ place: 5 });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.status).toBe("ready");
    await act(async () => { vi.advanceTimersByTime(900); }); // past the first question's clock
    expect(result.current.status).toBe("ready");
  });

  it("does not give up on an answer that came in time", async () => {
    vi.useFakeTimers();
    const f = vi.fn(() => answer(200, { options: [OPTION] }));
    const { result } = renderHook(() => useShippingQuote(5, items, true, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 1000 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.status).toBe("ready");
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(result.current.status).toBe("ready");
  });
});
