import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for code that runs in the browser. @supabase/ssr hands back one shared instance per URL and key,
 * so this is the same client (and the same signed-in session) that the auth module uses. Row Level Security, not this
 * client, is what decides what the signed-in person may read or change.
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
}
