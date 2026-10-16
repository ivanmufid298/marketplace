import { createBrowserClient } from "@supabase/ssr";
import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";
import type { ActionResult, AuthClient, AuthErrorKey, AuthResult, AuthUser } from "./types";

/** Maps a Supabase auth error to the keys under store.auth.errors. Unknown errors fall back to "unknown". */
export function mapAuthError(error: Pick<AuthError, "code" | "status"> | null | undefined): AuthErrorKey {
  switch (error?.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "user_already_exists":
    case "email_exists":
      return "emailTaken";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "session_not_found":
    case "otp_expired":
      return "linkExpired";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "tooMany";
    default:
      return error?.status === 429 ? "tooMany" : "unknown";
  }
}

export function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const email = user.email ?? "";
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  return { id: user.id, email, name: fullName || email.split("@")[0] };
}

/** The part of the Supabase client that changing a password needs, so it can be tested without the network. */
export type PasswordClient = { auth: Pick<SupabaseClient["auth"], "getUser" | "signInWithPassword" | "updateUser"> };

/** Checks the current password by signing in with it, then sets the new one. */
export async function changePasswordWith(supabase: PasswordClient, currentPassword: string, newPassword: string): Promise<ActionResult> {
  try {
    const { data, error: userError } = await supabase.auth.getUser();
    const email = data?.user?.email;
    if (userError || !email) return { ok: false, error: "notSignedIn" };
    const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (check.error) return { ok: false, error: check.error.code === "invalid_credentials" ? "wrongCurrentPassword" : mapAuthError(check.error) };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error ? { ok: false, error: mapAuthError(error) } : { ok: true };
  } catch {
    return { ok: false, error: "unknown" };
  }
}

/** Supabase Auth with email and password. Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. */
export function createSupabaseAuth(url: string, key: string): AuthClient {
  const supabase = createBrowserClient(url, key);

  return {
    demo: false,
    subscribe(listener) {
      // onAuthStateChange emits INITIAL_SESSION on subscribe, so the listener gets the current user right away.
      const { data } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => listener(toAuthUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password): Promise<AuthResult> {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { ok: false, error: mapAuthError(error) };
        return { ok: true, user: toAuthUser(data.user), needsConfirmation: false };
      } catch {
        return { ok: false, error: "unknown" };
      }
    },
    async signUp({ name, email, password }): Promise<AuthResult> {
      try {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
        if (error) return { ok: false, error: mapAuthError(error) };
        // With "Confirm email" on, an already-registered address comes back as a user with no identities.
        if (data.user && data.user.identities?.length === 0) return { ok: false, error: "emailTaken" };
        // No session means the project requires email confirmation first.
        return { ok: true, user: toAuthUser(data.user), needsConfirmation: !data.session };
      } catch {
        return { ok: false, error: "unknown" };
      }
    },
    async requestPasswordReset(email): Promise<ActionResult> {
      try {
        // The link lands on this same site. Supabase only honours redirectTo for URLs on its allow-list
        // (Authentication → URL Configuration) and otherwise falls back to the Site URL.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        return error ? { ok: false, error: mapAuthError(error) } : { ok: true };
      } catch {
        return { ok: false, error: "unknown" };
      }
    },
    async updatePassword(password): Promise<ActionResult> {
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) return { ok: true };
        // No session at all (for example the recovery session already expired) arrives without a code.
        return { ok: false, error: error.name === "AuthSessionMissingError" ? "linkExpired" : mapAuthError(error) };
      } catch {
        return { ok: false, error: "unknown" };
      }
    },
    changePassword: (currentPassword, newPassword) => changePasswordWith(supabase, currentPassword, newPassword),
    async signOut() {
      try {
        await supabase.auth.signOut();
      } catch {
        // Offline: the local session is cleared by supabase-js anyway.
      }
    },
  };
}
