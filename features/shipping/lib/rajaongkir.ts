import type { Destination, ProviderError, ProviderRate, ProviderResult, ShippingProvider } from "./types";

// RajaOngkir (Komerce) API v2, used from the server only: the key never reaches the browser. The free plan allows 100 hits
// a day, so the callers cache what they can and fall back to the shop's own rates when this says `quota` or `unavailable`.

export const RAJAONGKIR_BASE_URL = "https://rajaongkir.komerce.id/api/v1";
/** The provider's firewall refuses clients that do not say who they are (the default of many HTTP libraries is blocked). */
export const USER_AGENT = "marketplace-shop/1.0 (+server-side rate lookup)";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type Options = { apiKey?: string; baseUrl?: string; fetchImpl?: FetchLike; timeoutMs?: number };

const text = (v: unknown) => (typeof v === "string" ? v : "");

export function toDestination(row: unknown): Destination | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "number" || !Number.isInteger(r.id) || r.id <= 0 || !text(r.label)) return null;
  return { id: r.id, label: text(r.label), province: text(r.province_name), city: text(r.city_name), district: text(r.district_name), subdistrict: text(r.subdistrict_name), postcode: text(r.zip_code) };
}

export function toRate(row: unknown): ProviderRate | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.cost !== "number" || !Number.isInteger(r.cost) || r.cost < 0 || !text(r.code) || !text(r.service)) return null;
  return { courier: text(r.code).toLowerCase(), courierName: text(r.name), service: text(r.service), description: text(r.description), fee: r.cost, etd: text(r.etd).trim() };
}

/** What a failed answer means. Cloudflare's own refusal (error 1010 and the like) is the provider's firewall, not our key. */
export function errorFor(status: number, body: unknown): ProviderError {
  const message = typeof body === "object" && body !== null ? text((body as { meta?: { message?: unknown } }).meta?.message) + " " + text((body as { detail?: unknown }).detail) : "";
  const metaCode = typeof body === "object" && body !== null ? (body as { meta?: { code?: unknown } }).meta?.code : undefined;
  if (status === 429 || metaCode === 429 || /limit|quota|exceed|too many/i.test(message)) return "quota";
  if (status === 401 || status === 403) return "rejected";
  if (status === 400 || status === 404 || status === 422) return "invalid";
  return "unavailable";
}

export function createRajaOngkirProvider({ apiKey, baseUrl = RAJAONGKIR_BASE_URL, fetchImpl = fetch, timeoutMs = 8000 }: Options = {}): ShippingProvider {
  const key = apiKey?.trim() ?? "";

  async function call(path: string, body?: URLSearchParams): Promise<ProviderResult<unknown>> {
    if (!key) return { ok: false, error: "notConfigured" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: { key, Accept: "application/json", "User-Agent": USER_AGENT, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
        body: body?.toString(),
        signal: controller.signal,
      });
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        // Not JSON: judged by the status alone.
      }
      if (!response.ok) return { ok: false, error: errorFor(response.status, json) };
      // The provider also reports failures inside a 200.
      const code = typeof json === "object" && json !== null ? (json as { meta?: { code?: unknown } }).meta?.code : undefined;
      if (typeof code === "number" && code >= 400) return { ok: false, error: errorFor(code, json) };
      return { ok: true, value: json };
    } catch {
      return { ok: false, error: "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }

  const rows = (json: unknown): unknown[] => (typeof json === "object" && json !== null && Array.isArray((json as { data?: unknown }).data) ? ((json as { data: unknown[] }).data) : []);

  return {
    async searchDestinations(query, limit = 8) {
      const result = await call(`/destination/domestic-destination?${new URLSearchParams({ search: query, limit: String(limit), offset: "0" })}`);
      if (!result.ok) return result;
      return { ok: true, value: rows(result.value).map(toDestination).filter((d): d is Destination => d !== null) };
    },
    async quote({ originId, destinationId, weightGram, couriers }) {
      const result = await call("/calculate/domestic-cost", new URLSearchParams({ origin: String(originId), destination: String(destinationId), weight: String(weightGram), courier: couriers.join(":"), price: "lowest" }));
      if (!result.ok) return result;
      return { ok: true, value: rows(result.value).map(toRate).filter((r): r is ProviderRate => r !== null) };
    },
  };
}
