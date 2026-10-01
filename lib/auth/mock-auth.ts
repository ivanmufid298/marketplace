import type { AuthClient, AuthUser, SignUpInput } from "./types";

// Demo-only auth for development and previews without a Supabase project. It does NOT verify credentials: any
// well-formed email with a password of 8+ characters signs in. The user id is the email's local part, so
// nadia@anything matches the seeded buyer "nadia" in lib/mock/orders.ts.

const SESSION_KEY = "marketplace-demo-session-v1";
const NAMES_KEY = "marketplace-demo-names-v1";

const listeners = new Set<(user: AuthUser | null) => void>();
let listening = false;

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

const currentUser = () => readJson<AuthUser>(SESSION_KEY);
const emit = () => listeners.forEach((l) => l(currentUser()));

const idFor = (email: string) => email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
const titleCase = (s: string) => s.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function startSync() {
  if (listening) return;
  listening = true;
  // Keep other tabs in step when one signs in or out.
  window.addEventListener("storage", (e) => {
    if (e.key === SESSION_KEY) emit();
  });
}

function begin(email: string, name?: string): AuthUser {
  const names = readJson<Record<string, string>>(NAMES_KEY) ?? {};
  const known = names[email];
  const user: AuthUser = { id: idFor(email), email, name: name?.trim() || known || titleCase(email.split("@")[0]) };
  writeJson(NAMES_KEY, { ...names, [email]: user.name });
  writeJson(SESSION_KEY, user);
  emit();
  return user;
}

export const mockAuth: AuthClient = {
  demo: true,
  subscribe(listener) {
    startSync();
    listeners.add(listener);
    listener(currentUser());
    return () => {
      listeners.delete(listener);
    };
  },
  async signIn(email) {
    return { ok: true, user: begin(email.trim().toLowerCase()), needsConfirmation: false };
  },
  async signUp({ name, email }: SignUpInput) {
    return { ok: true, user: begin(email.trim().toLowerCase(), name), needsConfirmation: false };
  },
  async signOut() {
    writeJson(SESSION_KEY, null);
    emit();
  },
};
