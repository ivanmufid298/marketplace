import { mockAuth } from "./mock-auth";
import { createSupabaseAuth } from "./supabase-auth";
import type { AuthClient } from "./types";

let client: AuthClient | null = null;

/** Supabase when both env vars are set, otherwise the demo adapter. Created once per browser tab. */
export function getAuthClient(): AuthClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    client = url && key ? createSupabaseAuth(url, key) : mockAuth;
  }
  return client;
}

export type { AuthClient, AuthErrorKey, AuthResult, AuthUser, SignUpInput } from "./types";
