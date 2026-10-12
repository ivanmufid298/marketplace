// Public API of the auth module for server code: the /admin guard, the auth mode, and the `next=` check.
// Nothing reachable from here may import React or a "use client" file; features/architecture.test.mts enforces that,
// so proxy.ts stays small and never bundles browser-only code.

export { checkAdminAccess, CONFIG_REDIRECT, loginRedirect, type AdminAccess, type GuardClient } from "./lib/admin-guard";
export { authMode, type AuthMode } from "./lib/config";
export { safeAdminNext } from "./lib/safe-next";
