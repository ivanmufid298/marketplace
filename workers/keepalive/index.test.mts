// Run with `npm test`. The anti-pause Worker: what it asks Supabase, and that it fails loudly when it cannot.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker, { ping } from "./index.mjs";

const answer = (status: number) => async () => new Response(null, { status });
const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon-key" };

describe("ping", () => {
  it("reads one product id with the public key, and says what Supabase answered", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const status = await ping(env, async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("[]", { status: 200 }); });
    assert.equal(status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://abc.supabase.co/rest/v1/products?select=id&limit=1");
    assert.deepEqual(calls[0].init.headers, { apikey: "anon-key", Authorization: "Bearer anon-key" });
  });

  it("copes with a trailing slash and stray spaces in the settings", async () => {
    let seen = "";
    await ping({ SUPABASE_URL: " https://abc.supabase.co/// ", SUPABASE_ANON_KEY: " k " }, async (url: string, init: RequestInit) => { seen = url + JSON.stringify(init.headers); return new Response(null, { status: 200 }); });
    assert.equal(seen, 'https://abc.supabase.co/rest/v1/products?select=id&limit=1{"apikey":"k","Authorization":"Bearer k"}');
  });

  it("fails, naming the status, when Supabase answers with an error", async () => {
    await assert.rejects(ping(env, answer(503)), /keepalive_failed_503/);
    await assert.rejects(ping(env, answer(401)), /keepalive_failed_401/);
  });

  it("fails when it was deployed without its settings, and does not call anyone", async () => {
    let called = false;
    const spy = async () => { called = true; return new Response(null, { status: 200 }); };
    await assert.rejects(ping({ SUPABASE_ANON_KEY: "k" }, spy), /keepalive_not_configured/);
    await assert.rejects(ping({ SUPABASE_URL: "https://abc.supabase.co" }, spy), /keepalive_not_configured/);
    await assert.rejects(ping({ SUPABASE_URL: "  ", SUPABASE_ANON_KEY: "k" }, spy), /keepalive_not_configured/);
    await assert.rejects(ping(undefined, spy), /keepalive_not_configured/);
    assert.equal(called, false);
  });

  it("lets the error of a network failure through", async () => {
    await assert.rejects(ping(env, async () => { throw new Error("offline"); }), /offline/);
  });
});

describe("the scheduled run", () => {
  it("waits for the ping, so a failure shows as a failed run", async () => {
    await assert.rejects(worker.scheduled({}, {}), /keepalive_not_configured/);
  });
});
