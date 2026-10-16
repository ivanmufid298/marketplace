// A tiny scheduled Cloudflare Worker that asks the shop's Supabase project one cheap question a day, so the free plan does
// not pause the project for inactivity (a paused project means a shop that is down). It reads at most one product id with
// the public (anon) key, the same call a visitor's browser makes, so it needs no secret.
//
// Deploy it on its own, apart from the shop (see README, "Menayangkan di Cloudflare"):
//   npx wrangler deploy --config workers/keepalive/wrangler.jsonc --var SUPABASE_URL:<url> --var SUPABASE_ANON_KEY:<anon key>

/** Makes the request. Throws (so the run shows as failed in the Workers dashboard) when it is not set up or Supabase answers with an error. */
export async function ping(env, fetchImpl = fetch) {
  const base = String(env?.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = String(env?.SUPABASE_ANON_KEY ?? "").trim();
  if (!base || !key) throw new Error("keepalive_not_configured");
  const response = await fetchImpl(`${base}/rest/v1/products?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`keepalive_failed_${response.status}`);
  return response.status;
}

export default {
  async scheduled(_event, env) {
    await ping(env);
  },
};
