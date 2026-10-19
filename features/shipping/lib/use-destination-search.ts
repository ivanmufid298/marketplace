"use client";

import { useEffect, useState } from "react";
import { normalizeQuery } from "./destinations";
import type { Destination } from "./types";

export type SearchError = "signIn" | "quota" | "unavailable" | "notConfigured" | "failed";
export type DestinationSearch = { status: "idle" | "loading" | "ready" | "error"; results: Destination[]; error: SearchError | null };

/** How long the buyer must stop typing before a search is sent: every distinct search spends one of the day's free hits. */
export const DEBOUNCE_MS = 500;

type Options = { fetchImpl?: typeof fetch; debounceMs?: number };

// What this browser has already been told, so typing the same words again costs nothing.
const remembered = new Map<string, Destination[]>();
export const forgetDestinations = () => remembered.clear();

const isDestination = (x: unknown): x is Destination => typeof x === "object" && x !== null && typeof (x as Destination).id === "number" && typeof (x as Destination).label === "string";

/** What the address search answered, or why not. */
export async function fetchDestinations(query: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ ok: true; value: Destination[] } | { ok: false; error: SearchError }> {
  try {
    const response = await fetchImpl(`/api/shipping/destinations?q=${encodeURIComponent(query)}`, { signal, headers: { Accept: "application/json" } });
    const body: unknown = await response.json().catch(() => null);
    if (response.ok && typeof body === "object" && body !== null && Array.isArray((body as { destinations?: unknown }).destinations)) {
      return { ok: true, value: (body as { destinations: unknown[] }).destinations.filter(isDestination) };
    }
    const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
    if (error === "signIn" || error === "quota" || error === "unavailable" || error === "notConfigured") return { ok: false, error };
    return { ok: false, error: response.status === 401 ? "signIn" : "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Searches places as the buyer types: waits for a pause, asks once per distinct search, and never shows an answer to an older one. */
export function useDestinationSearch(query: string, { fetchImpl, debounceMs = DEBOUNCE_MS }: Options = {}): DestinationSearch {
  const normalized = normalizeQuery(query);
  const [answer, setAnswer] = useState<{ for: string; result: { ok: true; value: Destination[] } | { ok: false; error: SearchError } } | null>(null);

  useEffect(() => {
    if (!normalized || remembered.has(normalized)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await fetchDestinations(normalized, fetchImpl ?? fetch, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) remembered.set(normalized, result.value);
      setAnswer({ for: normalized, result });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, fetchImpl, debounceMs]);

  if (!normalized) return { status: "idle", results: [], error: null };
  const known = remembered.get(normalized);
  if (known) return { status: "ready", results: known, error: null };
  if (answer?.for === normalized) return answer.result.ok ? { status: "ready", results: answer.result.value, error: null } : { status: "error", results: [], error: answer.result.error };
  return { status: "loading", results: [], error: null };
}
