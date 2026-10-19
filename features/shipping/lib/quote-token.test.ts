// Run with `npm run test:ui`. The signed quote: that what the server signs is accepted, and that anything changed, forged, or old is not.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { QUOTE_TTL_SECONDS, signQuote, verifyQuote, type QuotePayload } from "./quote-token";

const payload: QuotePayload = { u: "6f1c0a52-0000-4000-8000-000000000001", o: 17549, d: 17536, w: 1500, c: "sicepat", v: "REG", f: 8000, e: "1-2 day", x: 2_000_000_000 };
const SECRET = "a-long-random-secret-only-the-server-knows";
const NOW = 1_900_000_000;

const swap = (token: string, change: (p: QuotePayload) => QuotePayload) => {
  const [body, signature] = token.split(".");
  const original = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(body.length / 4) * 4, "=")));
  const forged = btoa(JSON.stringify(change(original))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${forged}.${signature}`;
};

describe("what the database checks", () => {
  // place_order() recomputes the signature in SQL (supabase/tests/shipping-quotes.test.mjs checks that against Node's HMAC too). If the
  // two ever disagreed on the bytes, every order with a courier price would be refused, so the signature is pinned to the standard HMAC.
  it("is the standard HMAC-SHA256 of the payload text, in url-safe base64", async () => {
    const token = await signQuote(payload, SECRET);
    const [body, signature] = token.split(".");
    expect(signature).toBe(createHmac("sha256", SECRET).update(body).digest("base64url"));
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))).toEqual(payload);
  });
  it("signs text with characters beyond ASCII as UTF-8", async () => {
    const odd = { ...payload, e: "1–2 hari ☀" };
    const [body, signature] = (await signQuote(odd, SECRET)).split(".");
    expect(signature).toBe(createHmac("sha256", SECRET).update(body).digest("base64url"));
    expect(JSON.parse(Buffer.from(body, "base64url").toString("utf8")).e).toBe("1–2 hari ☀");
  });
  it("writes no padding and no characters outside the url-safe set", async () => {
    for (const f of [1, 22, 333, 4444]) expect(await signQuote({ ...payload, f }, SECRET)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

describe("signing and checking", () => {
  it("accepts a token the secret signed, and gives back what was signed", async () => {
    const token = await signQuote(payload, SECRET);
    expect(await verifyQuote(token, SECRET, NOW)).toEqual({ ok: true, payload });
  });
  it("makes a token of two url-safe parts", async () => {
    const token = await signQuote(payload, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token.split(".")).toHaveLength(2);
  });
  it("signs the same quote the same way every time, and a different quote differently", async () => {
    expect(await signQuote(payload, SECRET)).toBe(await signQuote(payload, SECRET));
    expect(await signQuote({ ...payload, f: 7999 }, SECRET)).not.toBe(await signQuote(payload, SECRET));
  });
  it("refuses a token signed with another secret", async () => {
    expect(await verifyQuote(await signQuote(payload, "another-secret-entirely"), SECRET, NOW)).toEqual({ ok: false, error: "badSignature" });
  });
  it("refuses a token whose price, weight, service, place, or owner was changed after signing", async () => {
    const token = await signQuote(payload, SECRET);
    for (const change of [(p: QuotePayload) => ({ ...p, f: 1 }), (p: QuotePayload) => ({ ...p, w: 100 }), (p: QuotePayload) => ({ ...p, v: "BEST" }), (p: QuotePayload) => ({ ...p, c: "jne" }), (p: QuotePayload) => ({ ...p, d: 1 }), (p: QuotePayload) => ({ ...p, o: 1 }), (p: QuotePayload) => ({ ...p, u: "someone-else" }), (p: QuotePayload) => ({ ...p, x: p.x + 1 })]) {
      expect(await verifyQuote(swap(token, change), SECRET, NOW)).toEqual({ ok: false, error: "badSignature" });
    }
  });
  it("refuses a token whose signature was cut short, changed, or taken from another quote", async () => {
    const token = await signQuote(payload, SECRET);
    const other = await signQuote({ ...payload, f: 1 }, SECRET);
    expect(await verifyQuote(`${token.split(".")[0]}.${other.split(".")[1]}`, SECRET, NOW)).toEqual({ ok: false, error: "badSignature" });
    expect(await verifyQuote(token.slice(0, -1), SECRET, NOW)).toEqual({ ok: false, error: "badSignature" });
    // Two characters short is not even a whole signature any more.
    expect(await verifyQuote(token.slice(0, -2), SECRET, NOW)).toEqual({ ok: false, error: "malformed" });
    expect(await verifyQuote(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, SECRET, NOW)).toEqual({ ok: false, error: "badSignature" });
  });
});

describe("time", () => {
  it("is good until its moment and not at it", async () => {
    const token = await signQuote({ ...payload, x: NOW + 10 }, SECRET);
    expect(await verifyQuote(token, SECRET, NOW + 9)).toMatchObject({ ok: true });
    expect(await verifyQuote(token, SECRET, NOW + 10)).toEqual({ ok: false, error: "expired" });
    expect(await verifyQuote(token, SECRET, NOW + 11)).toEqual({ ok: false, error: "expired" });
  });
  it("is good for half an hour", () => expect(QUOTE_TTL_SECONDS).toBe(1800));
});

describe("what is not a token", () => {
  it("is refused as malformed: empty, no dot, three parts, characters outside base64url, an empty part", async () => {
    for (const bad of ["", "abc", "a.b.c", "a b.c", "***.***", ".", "abc.", ".abc"]) expect(await verifyQuote(bad, SECRET, NOW), bad).toMatchObject({ ok: false });
    expect((await verifyQuote("a.b.c", SECRET, NOW))).toEqual({ ok: false, error: "malformed" });
    expect((await verifyQuote("a b.c", SECRET, NOW))).toEqual({ ok: false, error: "malformed" });
  });
  it("is refused when it is not written exactly as a token is: a space inside it, or the usual base64 characters where the url-safe ones belong", async () => {
    const token = await signQuote(payload, SECRET);
    const [body, signature] = token.split(".");
    expect(await verifyQuote(`${body.slice(0, 5)} ${body.slice(5)}.${signature}`, SECRET, NOW)).toEqual({ ok: false, error: "malformed" });
    expect(await verifyQuote(`${body}.${signature.slice(0, 5)} ${signature.slice(5)}`, SECRET, NOW)).toEqual({ ok: false, error: "malformed" });
    // Find a token whose signature has a "-" or "_", and write it the other way: the same bytes, but not the same token.
    let found = false;
    for (let f = 1; f < 200 && !found; f++) {
      const t = await signQuote({ ...payload, f }, SECRET);
      const sig = t.split(".")[1];
      if (!/[-_]/.test(sig)) continue;
      found = true;
      const standard = sig.replace(/-/g, "+").replace(/_/g, "/");
      expect(await verifyQuote(`${t.split(".")[0]}.${standard}`, SECRET, NOW)).toEqual({ ok: false, error: "malformed" });
      expect(await verifyQuote(t, SECRET, NOW)).toMatchObject({ ok: true });
    }
    expect(found).toBe(true);
  });
  it("is refused, without checking anything, when there is no secret to check with", async () => {
    expect(await verifyQuote(await signQuote(payload, SECRET), "", NOW)).toEqual({ ok: false, error: "malformed" });
  });
  it("is refused when what was signed is not a quote, even with a good signature", async () => {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const forge = async (text: string) => { const body = b64(enc.encode(text)); return `${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))))}`; };
    for (const text of ["not json", "[]", "null", "5", JSON.stringify({ ...payload, f: "8000" }), JSON.stringify({ ...payload, f: -1 }), JSON.stringify({ ...payload, f: 1.5 }), JSON.stringify({ ...payload, u: 5 }), JSON.stringify({ ...payload, x: undefined }), JSON.stringify({ u: "x" }), JSON.stringify({ ...payload, w: "1500" }), JSON.stringify({ ...payload, w: -1 }), JSON.stringify({ ...payload, o: -1 }), JSON.stringify({ ...payload, d: 1.5 }), JSON.stringify({ ...payload, x: "9" }), JSON.stringify({ ...payload, c: 5 }), JSON.stringify({ ...payload, v: 5 }), JSON.stringify({ ...payload, e: 5 })]) {
      expect(await verifyQuote(await forge(text), SECRET, NOW), text).toEqual({ ok: false, error: "malformed" });
    }
  });
  it("cannot be signed without a secret", async () => {
    await expect(signQuote(payload, "")).rejects.toThrow();
  });
  it("keeps names with accents and symbols intact", async () => {
    const odd = { ...payload, e: "1–2 hari · besok", v: "ÉCO/β" };
    expect(await verifyQuote(await signQuote(odd, SECRET), SECRET, NOW)).toEqual({ ok: true, payload: odd });
  });
});
