// Where to send an admin after signing in. The value comes from a query string, so it must never become an open
// redirect: only a plain path under /admin is accepted. No query string, no dots, no backslashes, no percent
// signs (encoded URLs), and nothing that could be read as a protocol-relative URL.

const ADMIN_PATH = /^\/admin(\/[a-zA-Z0-9/_-]*)?$/;
const FALLBACK = "/admin";

export function safeAdminNext(value: string | null | undefined): string {
  if (!value || !ADMIN_PATH.test(value)) return FALLBACK;
  // Sending someone back to the login page after logging in would loop.
  if (value === "/admin/login" || value.startsWith("/admin/login/")) return FALLBACK;
  return value;
}
