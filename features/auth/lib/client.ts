import { authMode, type AuthMode } from "./config";
import { mockAuth } from "./mock-auth";
import { createSupabaseAuth } from "./supabase-auth";
import type { AuthClient } from "./types";

/** Used when no login is allowed: nobody can sign in, and the UI says why. */
const unavailableAuth: AuthClient = {
  demo: false,
  subscribe(listener) {
    listener(null);
    return () => {};
  },
  async signIn() {
    return { ok: false, error: "notConfigured" };
  },
  async signUp() {
    return { ok: false, error: "notConfigured" };
  },
  async requestPasswordReset() {
    return { ok: false, error: "notConfigured" };
  },
  async updatePassword() {
    return { ok: false, error: "notConfigured" };
  },
  async signOut() {},
};

let client: AuthClient | null = null;

/** Supabase when its env vars are set, the demo login where that is allowed (see config.ts), otherwise nothing. */
export function getAuthClient(): AuthClient {
  if (!client) {
    const mode = authMode();
    client =
      mode === "supabase"
        ? createSupabaseAuth(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "")
        : mode === "demo"
          ? mockAuth
          : unavailableAuth;
  }
  return client;
}

export { authMode };
export type { ActionResult, AuthClient, AuthErrorKey, AuthResult, AuthUser, SignUpInput } from "./types";
export type { AuthMode };
