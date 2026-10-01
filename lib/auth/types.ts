export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

/** Keys into store.auth.errors in content/id.json. */
export type AuthErrorKey = "invalidCredentials" | "emailTaken" | "weakPassword" | "emailNotConfirmed" | "tooMany" | "unknown";

export type AuthResult =
  | { ok: true; user: AuthUser | null; /** True when the account exists but must confirm its email before signing in. */ needsConfirmation: boolean }
  | { ok: false; error: AuthErrorKey };

export type SignUpInput = { name: string; email: string; password: string };

/** What the storefront needs from an auth backend. Supabase in production, a local demo adapter otherwise. */
export interface AuthClient {
  /** Demo adapters accept any credentials, so the UI warns about it. */
  readonly demo: boolean;
  /** Calls `listener` right away with the current user, then on every sign in or out. Returns an unsubscribe function. */
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  signOut(): Promise<void>;
}
