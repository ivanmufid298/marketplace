"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAuthClient, type AuthResult, type AuthUser, type SignUpInput } from "@/lib/auth";

/** What the buyer was trying to do when asked to sign in. Used for the dialog text and to resume afterwards. */
export type LoginIntent = "default" | "chat" | "checkout" | "orders";

type AuthContextValue = {
  user: AuthUser | null;
  /** False until the first session lookup finishes. */
  ready: boolean;
  /** True when running on the demo adapter instead of Supabase. */
  demo: boolean;
  loginOpen: boolean;
  intent: LoginIntent;
  openLogin: (intent?: LoginIntent) => void;
  closeLogin: () => void;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (input: SignUpInput) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getAuthClient(), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [intent, setIntent] = useState<LoginIntent>("default");

  useEffect(
    () =>
      client.subscribe((next) => {
        setUser(next);
        setReady(true);
      }),
    [client],
  );

  const openLogin = useCallback((next: LoginIntent = "default") => {
    setIntent(next);
    setLoginOpen(true);
  }, []);

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
    setIntent("default");
  }, []);

  const value: AuthContextValue = {
    user,
    ready,
    demo: client.demo,
    loginOpen,
    intent,
    openLogin,
    closeLogin,
    signIn: client.signIn,
    signUp: client.signUp,
    signOut: client.signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
