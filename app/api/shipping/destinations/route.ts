import type { NextRequest } from "next/server";
import { authMode } from "@/features/auth/server";
import { answerDestinationSearch, defaultCache, shippingProvider } from "@/features/shipping/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Looks a place up for the address form ("Kebayoran Baru", "12150") through the shipping provider. Only for signed-in buyers.
export async function GET(request: NextRequest) {
  const mode = authMode();
  if (mode === "misconfigured") return Response.json({ error: "unavailable" }, { status: 503 });
  let signedIn = mode === "demo";
  if (mode === "supabase") {
    const { data } = await (await createSupabaseServerClient()).auth.getUser();
    signedIn = Boolean(data.user);
  }
  const reply = await answerDestinationSearch({ query: request.nextUrl.searchParams.get("q"), signedIn, provider: shippingProvider(), cache: defaultCache() });
  return Response.json(reply.body, { status: reply.status, headers: { "Cache-Control": "private, no-store" } });
}
