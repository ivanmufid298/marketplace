import type { NextRequest } from "next/server";
import { authMode } from "@/features/auth/server";
import { answerQuote, defaultCache, quoteLoaders, shippingProvider } from "@/features/shipping/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Prices the cart's shipping to a place, by courier and service, for the checkout. Only for signed-in buyers. The weight and the price of what
// is in the cart come from the database, and every service comes back with a signed token that the order is checked against.
export async function POST(request: NextRequest) {
  const mode = authMode();
  // Without a database there is nothing to read the cart's weight from.
  if (mode !== "supabase") return Response.json({ error: "unavailable" }, { status: 503 });
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getUser();
  const body: unknown = await request.json().catch(() => null);
  const reply = await answerQuote({
    body,
    user: data.user ? { id: data.user.id } : null,
    provider: shippingProvider(),
    cache: defaultCache(),
    secret: process.env.SHIPPING_QUOTE_SECRET ?? "",
    ...quoteLoaders(db),
  });
  return Response.json(reply.body, { status: reply.status, headers: { "Cache-Control": "private, no-store" } });
}
