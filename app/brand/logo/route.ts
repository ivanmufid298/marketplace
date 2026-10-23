import { loadLogo } from "@/features/brand/server";

// The shop's current logo as a PNG, at an address that never changes. Emails point their header picture here, so the logo the admin sets
// is the one every email shows. Public on purpose: no cookies, no sign-in, the same answer for everyone.
export async function GET() {
  const { bytes } = await loadLogo({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      // Short, so a new logo shows up within minutes; mail programs keep their own copy for longer, which is theirs to decide.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
