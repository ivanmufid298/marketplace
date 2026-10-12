// Public API of the auth module for client code. Everything else under features/auth is private.
// Code that must not pull in React (proxy.ts, layouts that only guard) imports "@/features/auth/server" instead.

export { AuthProvider, useAuth, type LoginIntent } from "./auth-provider";
export { LoginDialog } from "./components/login-dialog";
export { ForgotPasswordView } from "./components/forgot-password-view";
export { ResetPasswordView } from "./components/reset-password-view";
export { AdminLoginView, type AdminLoginError } from "./components/admin-login-view";
export { authMode, getAuthClient } from "./lib/client";
export type { ActionResult, AuthClient, AuthErrorKey, AuthMode, AuthResult, AuthUser, SignUpInput } from "./lib/client";
