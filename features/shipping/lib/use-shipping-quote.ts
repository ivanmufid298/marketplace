"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuoteOption } from "./quote";

/** Why no courier prices could be shown. The checkout then offers the shop's own rates instead. */
export type QuoteFailure = "signIn" | "originMissing" | "noRates" | "quota" | "unavailable" | "notConfigured" | "invalid" | "failed";
export type ShippingQuote = {
  status: "idle" | "loading" | "ready" | "error";
  options: QuoteOption[];
  error: QuoteFailure | null;
  /** Asks again (a quote the database no longer accepts, say). */
  refresh: () => void;
};

type Answer = { options: QuoteOption[] } | { error: QuoteFailure };
type Options = { fetchImpl?: typeof fetch; timeoutMs?: number };

/** How long the checkout waits for courier prices before it gives up and offers the shop's own rates. */
export const QUOTE_TIMEOUT_MS = 15_000;

const FAILURES: readonly string[] = ["signIn", "originMissing", "noRates", "quota", "unavailable", "notConfigured", "invalid"];

const isOption = (x: unknown): x is QuoteOption => {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.courier === "string" && typeof o.courierName === "string" && typeof o.service === "string" && typeof o.fee === "number" && typeof o.etd === "string" && typeof o.token === "string" && typeof o.description === "string";
};

/** What the quote address answered for this cart, or why not. */
export async function fetchQuote(destinationId: number, items: { productId: number; qty: number }[], fetchImpl: typeof fetch, signal?: AbortSignal): Promise<Answer> {
  try {
    const response = await fetchImpl("/api/shipping/quote", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ destinationId, items }),
    });
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === "object" && body !== null ? (body as { options?: unknown; error?: unknown }) : {};
    if (response.ok && Array.isArray(record.options)) {
      const options = record.options.filter(isOption);
      return options.length > 0 ? { options } : { error: "noRates" };
    }
    if (typeof record.error === "string" && FAILURES.includes(record.error)) return { error: record.error as QuoteFailure };
    return { error: response.status === 401 ? "signIn" : "failed" };
  } catch {
    return { error: "failed" };
  }
}

/**
 * The courier prices for this cart to this place, asked once per distinct cart and place (and again on `refresh`). The weight and prices
 * are read from the database by the server; only the products and quantities are sent. Never shows the answer to an older question.
 */
export function useShippingQuote(destinationId: number | null, items: { productId: number; qty: number }[], enabled: boolean, { fetchImpl, timeoutMs = QUOTE_TIMEOUT_MS }: Options = {}): ShippingQuote {
  const cartKey = [...items].sort((a, b) => a.productId - b.productId).map((i) => `${i.productId}x${i.qty}`).join(",");
  const [round, setRound] = useState(0);
  const key = enabled && destinationId !== null && cartKey ? `${destinationId}|${cartKey}|${round}` : null;
  const [answer, setAnswer] = useState<{ key: string; result: Answer } | null>(null);

  useEffect(() => {
    if (key === null || destinationId === null) return;
    const controller = new AbortController();
    const parsed = cartKey.split(",").map((part) => {
      const [productId, qty] = part.split("x").map(Number);
      return { productId, qty };
    });
    // A request that never answers must not leave the buyer waiting: after a while the shop's own rates are offered.
    const timer = setTimeout(() => {
      controller.abort();
      setAnswer({ key, result: { error: "failed" } });
    }, timeoutMs);
    void (async () => {
      const result = await fetchQuote(destinationId, parsed, fetchImpl ?? fetch, controller.signal);
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      setAnswer({ key, result });
    })();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, destinationId, cartKey, fetchImpl, timeoutMs]);

  const refresh = useCallback(() => setRound((r) => r + 1), []);
  if (key === null) return { status: "idle", options: [], error: null, refresh };
  if (answer?.key !== key) return { status: "loading", options: [], error: null, refresh };
  return "options" in answer.result
    ? { status: "ready", options: answer.result.options, error: null, refresh }
    : { status: "error", options: [], error: answer.result.error, refresh };
}
