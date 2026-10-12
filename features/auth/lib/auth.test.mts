// Run with `npm test`. Covers the pieces that decide who may see /admin. No network, no browser.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkAdminAccess, loginRedirect, type GuardClient } from "./admin-guard.ts";
import { resolveAuthMode, type AuthEnv } from "./config.ts";
import { safeAdminNext } from "./safe-next.ts";
import { mapAuthError } from "./supabase-auth.ts";

const SUPA = { supabaseUrl: "https://abc.supabase.co", supabaseKey: "sb_publishable_x" };

describe("resolveAuthMode", () => {
  const cases: [string, AuthEnv, string][] = [
    ["dev without env", { nodeEnv: "development" }, "demo"],
    ["production without env", { nodeEnv: "production" }, "misconfigured"],
    ["production + demo flag, no VERCEL_ENV (Cloudflare, VPS, laptop)", { nodeEnv: "production", demoFlag: "1" }, "misconfigured"],
    ["production + demo flag on Vercel Production", { nodeEnv: "production", demoFlag: "1", vercelEnv: "production" }, "misconfigured"],
    ["production + demo flag on Vercel Preview", { nodeEnv: "production", demoFlag: "1", vercelEnv: "preview" }, "demo"],
    ["Vercel Preview without the flag", { nodeEnv: "production", vercelEnv: "preview" }, "misconfigured"],
    ["Vercel Preview with flag 'true'", { nodeEnv: "production", demoFlag: "true", vercelEnv: "preview" }, "misconfigured"],
    ["Vercel Preview with flag '0'", { nodeEnv: "production", demoFlag: "0", vercelEnv: "preview" }, "misconfigured"],
    ["Vercel Development env", { nodeEnv: "production", demoFlag: "1", vercelEnv: "development" }, "misconfigured"],
    ["Supabase configured in production", { nodeEnv: "production", ...SUPA }, "supabase"],
    ["Supabase configured in dev", { nodeEnv: "development", ...SUPA }, "supabase"],
    ["Supabase configured beats the demo flag", { nodeEnv: "production", demoFlag: "1", vercelEnv: "preview", ...SUPA }, "supabase"],
    ["only the URL set, in production", { nodeEnv: "production", supabaseUrl: SUPA.supabaseUrl }, "misconfigured"],
    ["only the key set, in production", { nodeEnv: "production", supabaseKey: SUPA.supabaseKey }, "misconfigured"],
    ["blank Supabase values, in production", { nodeEnv: "production", supabaseUrl: "  ", supabaseKey: "" }, "misconfigured"],
    ["only the URL set, in dev (still demo, not half-configured Supabase)", { nodeEnv: "development", supabaseUrl: SUPA.supabaseUrl }, "demo"],
    ["unknown NODE_ENV", { nodeEnv: "staging" }, "misconfigured"],
    ["missing NODE_ENV", {}, "misconfigured"],
    ["missing NODE_ENV even with flag but no VERCEL_ENV", { demoFlag: "1" }, "misconfigured"],
  ];
  for (const [name, env, expected] of cases) {
    it(`${name} → ${expected}`, () => assert.equal(resolveAuthMode(env), expected));
  }
});

describe("safeAdminNext", () => {
  const accepted = ["/admin", "/admin/orders", "/admin/orders/", "/admin/a_b-c/d", "/admin/products"];
  for (const value of accepted) it(`accepts ${JSON.stringify(value)}`, () => assert.equal(safeAdminNext(value), value));

  const rejected: [string | null | undefined, string][] = [
    [null, "null"], [undefined, "undefined"], ["", "empty"], ["/", "the storefront"], ["/administrator", "a sibling path"],
    ["//evil.com", "protocol-relative"], ["https://evil.com", "absolute URL"], ["/admin//evil.com", "a dot in the host-like part"],
    ["/admin/../x", "dot segments"], ["/admin?next=/x", "query string"], ["/admin#frag", "fragment"],
    ["/admin\\evil", "backslash"], ["/admin%2Fx", "encoded slash"], ["/admin/%2e%2e/x", "encoded dots"], ["%2Fadmin", "encoded leading slash"],
    ["/ADMIN", "wrong case"], ["/admin\n", "trailing newline"], ["/admin/x\r\nSet-Cookie: a=b", "header injection"], ["javascript:alert(1)", "javascript URL"],
  ];
  for (const [value, why] of rejected) {
    it(`rejects ${why}`, () => {
      assert.equal(safeAdminNext(value), "/admin");
    });
  }
  it("never sends someone back to the login page", () => {
    assert.equal(safeAdminNext("/admin/login"), "/admin");
    assert.equal(safeAdminNext("/admin/login/x"), "/admin");
  });
});

type FakeUserResult = Awaited<ReturnType<GuardClient["auth"]["getUser"]>>;
const fake = (user: FakeUserResult | (() => never), rpc: { data: unknown; error: unknown } | (() => never)): GuardClient => ({
  auth: { getUser: async () => (typeof user === "function" ? user() : user) },
  rpc: () => ({ then: (ok: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve(typeof rpc === "function" ? rpc() : rpc).then(ok) }) as never,
});
const signedIn: FakeUserResult = { data: { user: { id: "u1" } }, error: null };
const anon = (error: { name?: string; status?: number }): FakeUserResult => ({ data: { user: null }, error });

describe("checkAdminAccess (fails closed)", () => {
  it("no session → anonymous", async () => assert.equal(await checkAdminAccess(fake(anon({ name: "AuthSessionMissingError", status: 400 }), { data: true, error: null })), "anonymous"));
  it("rejected token (401) → anonymous", async () => assert.equal(await checkAdminAccess(fake(anon({ status: 401 }), { data: true, error: null })), "anonymous"));
  it("rejected token (403) → anonymous", async () => assert.equal(await checkAdminAccess(fake(anon({ status: 403 }), { data: true, error: null })), "anonymous"));
  it("no user and no error → anonymous", async () => assert.equal(await checkAdminAccess(fake({ data: { user: null }, error: null }, { data: true, error: null })), "anonymous"));
  it("network failure (no status) → error", async () => assert.equal(await checkAdminAccess(fake(anon({ name: "AuthRetryableFetchError" }), { data: true, error: null })), "error"));
  it("status 0 → error", async () => assert.equal(await checkAdminAccess(fake(anon({ status: 0 }), { data: true, error: null })), "error"));
  it("Auth 500 → error", async () => assert.equal(await checkAdminAccess(fake(anon({ status: 500 }), { data: true, error: null })), "error"));
  it("Auth 503 → error", async () => assert.equal(await checkAdminAccess(fake(anon({ status: 503 }), { data: true, error: null })), "error"));
  it("signed in, is_admin true → ok", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: true, error: null })), "ok"));
  it("signed in, is_admin false → forbidden", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: false, error: null })), "forbidden"));
  it("signed in, is_admin null → forbidden", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: null, error: null })), "forbidden"));
  it("only a strict boolean true passes ('true' string is forbidden)", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: "true", error: null })), "forbidden"));
  it("only a strict boolean true passes (1 is forbidden)", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: 1, error: null })), "forbidden"));
  it("is_admin returns an error → error, even if data says true", async () => assert.equal(await checkAdminAccess(fake(signedIn, { data: true, error: { message: "boom" } })), "error"));
  it("getUser throws → error", async () => assert.equal(await checkAdminAccess(fake(() => { throw new Error("x"); }, { data: true, error: null })), "error"));
  it("rpc throws → error", async () => assert.equal(await checkAdminAccess(fake(signedIn, () => { throw new Error("x"); })), "error"));
});

describe("loginRedirect", () => {
  it("anonymous keeps the destination", () => assert.equal(loginRedirect("anonymous", "/admin/orders"), "/admin/login?next=%2Fadmin%2Forders"));
  it("anonymous without a destination", () => assert.equal(loginRedirect("anonymous"), "/admin/login"));
  it("forbidden", () => assert.equal(loginRedirect("forbidden", "/admin/orders"), "/admin/login?error=forbidden"));
  it("error", () => assert.equal(loginRedirect("error"), "/admin/login?error=unavailable"));
});

describe("mapAuthError (password reset)", () => {
  const cases: [string, { code?: string; status?: number } | null, string][] = [
    ["same_password → samePassword", { code: "same_password", status: 422 }, "samePassword"],
    ["weak_password → weakPassword", { code: "weak_password", status: 422 }, "weakPassword"],
    ["session_not_found → linkExpired", { code: "session_not_found", status: 403 }, "linkExpired"],
    ["otp_expired → linkExpired", { code: "otp_expired", status: 403 }, "linkExpired"],
    ["over_email_send_rate_limit → tooMany", { code: "over_email_send_rate_limit", status: 429 }, "tooMany"],
    ["429 without a code → tooMany", { status: 429 }, "tooMany"],
    ["unknown code → unknown", { code: "something_new", status: 500 }, "unknown"],
    ["null → unknown", null, "unknown"],
  ];
  for (const [name, error, expected] of cases) {
    it(name, () => assert.equal(mapAuthError(error as never), expected));
  }
});
