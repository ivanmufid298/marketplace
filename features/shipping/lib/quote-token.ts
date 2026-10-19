// A shipping quote the server has priced, signed so that the database can tell later that the price was not made up by the browser. The
// token is "<payload>.<signature>", both base64url; the signature is an HMAC-SHA256 of the payload text with a secret that only the server
// (and the database) know. The payload says whose quote it is, where it goes, how heavy, which service, what it costs, and until when.

export type QuotePayload = {
  /** The signed-in buyer it was priced for. */
  u: string;
  /** The provider's id of the place the parcel leaves from, and of the place it goes to. */
  o: number;
  d: number;
  /** The weight it was priced for, in grams. */
  w: number;
  /** Courier code, service code, price in rupiah, and the courier's estimate of days. */
  c: string;
  v: string;
  f: number;
  e: string;
  /** Good until this moment (seconds since 1970). */
  x: number;
};

export type QuoteCheck = { ok: true; payload: QuotePayload } | { ok: false; error: "malformed" | "badSignature" | "expired" };

/** How long a quote stays good for an order. */
export const QUOTE_TTL_SECONDS = 30 * 60;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const hmacKey = (secret: string, usage: "sign" | "verify") => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** Signs a payload. The secret must not be empty. */
export async function signQuote(payload: QuotePayload, secret: string): Promise<string> {
  if (!secret) throw new Error("A quote cannot be signed without a secret.");
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

const isPayload = (x: unknown): x is QuotePayload => {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  const whole = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  return typeof p.u === "string" && typeof p.c === "string" && typeof p.v === "string" && typeof p.e === "string" && whole(p.o) && whole(p.d) && whole(p.w) && whole(p.f) && whole(p.x);
};

/** Checks a token: that it is well formed, that the secret signed it (compared without leaking where they differ), and that it has not expired. */
export async function verifyQuote(token: string, secret: string, nowSeconds: number): Promise<QuoteCheck> {
  const parts = token.split(".");
  if (!secret || parts.length !== 2) return { ok: false, error: "malformed" };
  const [body, signature] = parts;
  const signed = fromBase64Url(signature);
  const raw = fromBase64Url(body);
  if (!signed || !raw) return { ok: false, error: "malformed" };
  const genuine = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signed as BufferSource, encoder.encode(body));
  if (!genuine) return { ok: false, error: "badSignature" };
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!isPayload(payload)) return { ok: false, error: "malformed" };
  return payload.x <= nowSeconds ? { ok: false, error: "expired" } : { ok: true, payload };
}
