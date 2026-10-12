import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminTemplate } from "@/components/templates/admin-template";
import { authMode, checkAdminAccess, CONFIG_REDIRECT, loginRedirect } from "@/features/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The second lock. proxy.ts already screens every /admin request, but a layout is not re-run when the visitor
// navigates between panel pages in the browser, and a wrong proxy matcher must not expose the panel. So the panel
// checks again whenever it is rendered on the server, and real data access must still be protected by RLS.
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const mode = authMode();
  if (mode === "misconfigured") redirect(CONFIG_REDIRECT);
  if (mode === "supabase") {
    const access = await checkAdminAccess(await createSupabaseServerClient());
    if (access !== "ok") redirect(loginRedirect(access));
  }
  return <AdminTemplate>{children}</AdminTemplate>;
}
