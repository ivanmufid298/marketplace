// Decides whether the current request may see /admin. Used by proxy.ts (every request) and the (panel) layout.
// It always fails closed: anything unexpected is a denial, never a pass.

export type AdminAccess = "ok" | "anonymous" | "forbidden" | "error";

/** The slice of the Supabase client the guard needs. Lets the guard be tested with a stand-in. */
export type GuardClient = {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: { name?: string; status?: number } | null }>;
  };
  rpc(fn: "is_admin"): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * 1. getUser() asks the Auth server to verify the session. getSession() would only read the cookie, which anyone can
 *    forge, so it is not used on the server.
 * 2. is_admin() reads the caller's role from the profiles table (see supabase/migrations). The role is never taken
 *    from the token's metadata or from anything the client sends.
 */
export async function checkAdminAccess(client: GuardClient): Promise<AdminAccess> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      // A missing or rejected session means "not signed in". A network failure or a 5xx from Auth is different:
      // we cannot tell, so say so (and still deny).
      const unreachable = error !== null && (error.status === undefined || error.status === 0 || error.status >= 500) && error.name !== "AuthSessionMissingError";
      return unreachable ? "error" : "anonymous";
    }
    const { data: isAdmin, error: rpcError } = await client.rpc("is_admin");
    if (rpcError) return "error";
    return isAdmin === true ? "ok" : "forbidden";
  } catch {
    return "error";
  }
}

/** Where a denial sends the visitor. */
export function loginRedirect(access: Exclude<AdminAccess, "ok">, next?: string): string {
  const params = new URLSearchParams();
  if (access === "forbidden") params.set("error", "forbidden");
  if (access === "error") params.set("error", "unavailable");
  if (access === "anonymous" && next) params.set("next", next);
  const query = params.toString();
  return `/admin/login${query ? `?${query}` : ""}`;
}

/** Where /admin sends everyone when no login is possible (see config.ts). */
export const CONFIG_REDIRECT = "/admin/login?error=config";
