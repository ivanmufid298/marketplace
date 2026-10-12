// Decides how the app handles login. Kept free of imports so it can be unit-tested on its own.

/**
 * - supabase: real accounts through Supabase Auth.
 * - demo: a local login that accepts any credentials and leaves /admin open. Never allowed in production by default.
 * - misconfigured: no login is possible and /admin is locked. This is the safe default for anything unrecognised.
 */
export type AuthMode = "supabase" | "demo" | "misconfigured";

export type AuthEnv = {
  nodeEnv?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  /** NEXT_PUBLIC_DEMO_MODE */
  demoFlag?: string;
  /** VERCEL_ENV, copied into the build by next.config.ts. Empty on every other host. */
  vercelEnv?: string;
};

/**
 * Allowlist, not denylist: demo mode is only on when
 *   - NODE_ENV is "development" (i.e. `next dev`), or
 *   - the demo flag is "1" AND the build runs on a Vercel Preview deployment.
 * Everything else without Supabase credentials is `misconfigured`, including a missing or unknown NODE_ENV. A host that has no VERCEL_ENV (Cloudflare, a
 * VPS, a laptop running `next start`) can therefore never end up in demo mode by accident.
 */
export function resolveAuthMode(env: AuthEnv): AuthMode {
  if (env.supabaseUrl?.trim() && env.supabaseKey?.trim()) return "supabase";
  const demoAllowed = env.nodeEnv === "development" || (env.demoFlag?.trim() === "1" && env.vercelEnv?.trim() === "preview");
  return demoAllowed ? "demo" : "misconfigured";
}

/**
 * The mode for this build. Every variable is referenced literally so Next.js can inline it into the browser bundle;
 * passing `process.env` as a whole object would leave it undefined on the client.
 */
export function authMode(): AuthMode {
  return resolveAuthMode({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    demoFlag: process.env.NEXT_PUBLIC_DEMO_MODE,
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
}
