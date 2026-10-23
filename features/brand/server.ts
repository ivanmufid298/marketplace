// The shop's logo for the places that cannot run the browser code: an address (`/brand/logo`) that always answers with the current logo (or
// the default one), which is what an email's header picture points at. No React in here.
import { defaultLogoBytes } from "./lib/default-logo";
import { LOGO_KEY_PATTERN, publicLogoUrl } from "./lib/types";
import { MAX_LOGO_BYTES } from "./lib/logo-image";

export type LogoAnswer = { bytes: Uint8Array; /** True when it is the shop's own logo, false for the default one. */ custom: boolean };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = (bytes: Uint8Array) => bytes.length > PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b);

/**
 * The shop's logo as PNG bytes, read through the public API with the anon key (the same read a visitor's browser does). Anything that goes
 * wrong (no database, no logo, an unreachable or unexpected answer, a file that is not a PNG or is too big) gives the default logo, never an error.
 */
export async function loadLogo(env: { supabaseUrl?: string | null; anonKey?: string | null }, fetchImpl: typeof fetch = fetch): Promise<LogoAnswer> {
  const fallback: LogoAnswer = { bytes: defaultLogoBytes(), custom: false };
  const base = env.supabaseUrl?.trim().replace(/\/+$/, "");
  const key = env.anonKey?.trim();
  if (!base || !key) return fallback;
  try {
    const profile = await fetchImpl(`${base}/rest/v1/shop_profile?id=eq.1&select=logo_key`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (!profile.ok) return fallback;
    const rows: unknown = await profile.json();
    const logoKey = Array.isArray(rows) ? (rows[0] as { logo_key?: unknown } | undefined)?.logo_key : undefined;
    if (typeof logoKey !== "string" || !LOGO_KEY_PATTERN.test(logoKey)) return fallback;
    const file = await fetchImpl(publicLogoUrl(base, logoKey));
    if (!file.ok) return fallback;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return isPng(bytes) && bytes.length <= MAX_LOGO_BYTES ? { bytes, custom: true } : fallback;
  } catch {
    return fallback;
  }
}
