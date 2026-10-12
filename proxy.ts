import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, checkAdminAccess, CONFIG_REDIRECT, loginRedirect, safeAdminNext } from "@/features/auth/server";

// Runs before every /admin request (Next.js 16 calls this file "proxy"; it used to be "middleware").
// It refreshes the Supabase session cookie and turns visitors away from /admin unless they are a signed-in admin.
// The (panel) layout checks again, so a wrong matcher here would not by itself expose the panel.

const LOGIN = "/admin/login";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const mode = authMode();
  const onLogin = pathname === LOGIN;

  // Demo mode (development, or a Vercel Preview with the demo flag) leaves /admin open on purpose.
  if (mode === "demo") return NextResponse.next();

  // No way to verify anyone: lock everything except the login page, which explains why.
  if (mode === "misconfigured") {
    if (onLogin) return NextResponse.next();
    return NextResponse.redirect(new URL(CONFIG_REDIRECT, request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const access = await checkAdminAccess(supabase);

  // A redirect has to carry any refreshed session cookies too, or the next request starts from a stale token.
  const redirect = (to: string) => {
    const out = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((cookie) => out.cookies.set(cookie));
    out.headers.set("Cache-Control", "private, no-store");
    return out;
  };

  if (onLogin) {
    // An admin who opens the login page goes straight to the panel (or where they were headed).
    if (access === "ok") return redirect(safeAdminNext(request.nextUrl.searchParams.get("next")));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (access !== "ok") {
    return redirect(loginRedirect(access, safeAdminNext(pathname) === pathname ? pathname : undefined));
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Only /admin: the storefront stays static, and assets, _next, and images are never touched.
export const config = { matcher: ["/admin", "/admin/:path*"] };
