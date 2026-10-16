export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

/** Keys into store.auth.errors in content/id.json. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "emailTaken"
  | "weakPassword"
  | "samePassword"
  | "wrongCurrentPassword"
  | "notSignedIn"
  | "linkExpired"
  | "emailNotConfirmed"
  | "tooMany"
  | "notConfigured"
  | "unknown";

export type AuthResult =
  | { ok: true; user: AuthUser | null; /** True when the account exists but must confirm its email before signing in. */ needsConfirmation: boolean }
  | { ok: false; error: AuthErrorKey };

/** Result of an action that returns no user, such as asking for a reset link or setting a new password. */
export type ActionResult = { ok: true } | { ok: false; error: AuthErrorKey };

export type SignUpInput = { name: string; email: string; password: string };

/** What the storefront needs from an auth backend. Supabase in production, a local demo adapter otherwise. */
export interface AuthClient {
  /** Demo adapters accept any credentials, so the UI warns about it. */
  readonly demo: boolean;
  /** Calls `listener` right away with the current user, then on every sign in or out. Returns an unsubscribe function. */
  subscribe(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(input: SignUpInput): Promise<AuthResult>;
  /**
   * Emails a link that opens /reset-password signed in with a short-lived recovery session. Backends answer the same
   * whether or not the address has an account, so this cannot be used to find out who is registered.
   */
  requestPasswordReset(email: string): Promise<ActionResult>;
  /** Sets a new password for the signed-in user (the recovery session from the emailed link counts). */
  updatePassword(password: string): Promise<ActionResult>;
  /**
   * Changes the password of the signed-in user after checking the current one, so someone who finds a signed-in browser cannot
   * lock the owner out. Fails with `wrongCurrentPassword` when the current password is not right.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<ActionResult>;
  signOut(): Promise<void>;
}
