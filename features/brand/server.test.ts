// Run with `npm run test:ui`. The logo for the address emails point at: the shop's own when it has one, the default in every other case.
import { describe, expect, it, vi } from "vitest";
import { defaultLogoBytes } from "./lib/default-logo";
import { MAX_LOGO_BYTES } from "./lib/logo-image";
import { loadLogo } from "./server";

const KEY = "logo/0a1b2c3d-4e5f-6789-abcd-ef0123456789.png";
const URL_ = "https://x.supabase.co";
const ENV = { supabaseUrl: URL_, anonKey: "anon-key" };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
const file = (bytes: Uint8Array, status = 200) => Promise.resolve(new Response(bytes as BodyInit, { status }));

/** A fake network: the profile row, then the file. */
function network(profile: () => Promise<Response>, picture: () => Promise<Response> = () => file(PNG)) {
  return vi.fn(async (url: string | URL | Request) => (String(url).includes("/rest/v1/shop_profile") ? profile() : picture())) as unknown as typeof fetch;
}
const isDefault = (a: { bytes: Uint8Array; custom: boolean }) => a.custom === false && a.bytes.length === defaultLogoBytes().length;

describe("loadLogo", () => {
  it("gives the shop's own logo, read with the public key like a visitor's browser would", async () => {
    const f = network(() => json([{ logo_key: KEY }]));
    const answer = await loadLogo(ENV, f);
    expect(answer.custom).toBe(true);
    expect([...answer.bytes]).toEqual([...PNG]);
    const [first, second] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(first[0]).toBe(`${URL_}/rest/v1/shop_profile?id=eq.1&select=logo_key`);
    expect(first[1].headers).toMatchObject({ apikey: "anon-key", Authorization: "Bearer anon-key" });
    expect(second[0]).toBe(`${URL_}/storage/v1/object/public/shop-brand/${KEY}`);
  });
  it("accepts a base address with slashes and spaces around it", async () => {
    const f = network(() => json([{ logo_key: KEY }]));
    expect((await loadLogo({ supabaseUrl: ` ${URL_}// `, anonKey: " anon-key " }, f)).custom).toBe(true);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`${URL_}/rest/v1/shop_profile?id=eq.1&select=logo_key`);
  });
  it.each([
    ["no database configured", { supabaseUrl: undefined, anonKey: "k" }],
    ["no key", { supabaseUrl: URL_, anonKey: "" }],
    ["blank settings", { supabaseUrl: "  ", anonKey: "  " }],
  ])("gives the default when there is %s, without asking anyone", async (_why, env) => {
    const f = vi.fn() as unknown as typeof fetch;
    expect(isDefault(await loadLogo(env, f))).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
  it("gives the default when the shop has no logo", async () => {
    expect(isDefault(await loadLogo(ENV, network(() => json([{ logo_key: null }]))))).toBe(true);
    expect(isDefault(await loadLogo(ENV, network(() => json([]))))).toBe(true);
  });
  it.each([
    ["a key that is not a logo key", () => json([{ logo_key: "../../secret.png" }])],
    ["a key that is not text", () => json([{ logo_key: 5 }])],
    ["an answer that is not a list", () => json({ logo_key: KEY })],
    ["a refused read", () => json({ message: "no" }, 401)],
    ["a refused read, even if its body looks like a profile", () => json([{ logo_key: KEY }], 500)],
    ["a read that fails", () => Promise.reject(new Error("offline"))],
    ["an answer that is not JSON", () => Promise.resolve(new Response("<html>", { status: 200 }))],
  ])("gives the default for %s", async (_why, profile) => {
    const f = network(profile);
    expect(isDefault(await loadLogo(ENV, f))).toBe(true);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
  it.each([
    ["a file that cannot be fetched", () => file(PNG, 404)],
    ["a file that is not a PNG", () => file(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]))],
    ["a file that is only the signature", () => file(PNG.slice(0, 8))],
    ["a file bigger than the bucket allows", () => file(Uint8Array.from({ length: MAX_LOGO_BYTES + 1 }, (_, i) => (i < 8 ? PNG[i] : 0)))],
    ["a file that fails halfway", () => Promise.reject(new Error("reset"))],
  ])("gives the default for %s", async (_why, picture) => {
    expect(isDefault(await loadLogo(ENV, network(() => json([{ logo_key: KEY }]), picture)))).toBe(true);
  });
  it("accepts a file of exactly the largest size", async () => {
    const big = Uint8Array.from({ length: MAX_LOGO_BYTES }, (_, i) => (i < 8 ? PNG[i] : 0));
    expect((await loadLogo(ENV, network(() => json([{ logo_key: KEY }]), () => file(big)))).custom).toBe(true);
  });
});
