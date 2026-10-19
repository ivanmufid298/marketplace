// Run with `npm run test:ui`. The address search as the browser meets it: who gets an answer.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mode = vi.fn(() => "supabase" as "supabase" | "demo" | "misconfigured");
let user: { id: string } | null = { id: "buyer-1" };
const search = vi.fn(async () => ({ ok: true as const, value: [{ id: 1, label: "CIPETE UTARA, KEBAYORAN BARU, JAKARTA SELATAN, DKI JAKARTA, 12150", province: "P", city: "C", district: "D", subdistrict: "S", postcode: "12150" }] }));

vi.mock("@/features/auth/server", () => ({ authMode: () => mode() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.mock("@/features/shipping/server", async (importActual) => {
  const actual = await importActual<typeof import("@/features/shipping/server")>();
  return { ...actual, shippingProvider: () => ({ searchDestinations: search, quote: vi.fn() }) };
});

const { GET } = await import("./route");
let counter = 0;
// Every call asks for words of its own: what is found is kept for a month, and these tests should not see each other's.
const call = (q: string | null) => GET(new NextRequest(`http://localhost/api/shipping/destinations${q === null ? "" : `?q=${encodeURIComponent(q)}`}`));

beforeEach(() => { mode.mockReturnValue("supabase"); user = { id: "buyer-1" }; search.mockClear(); counter++; });

describe("GET /api/shipping/destinations", () => {
  it("lists the places for a signed-in buyer, and lets no one keep the answer", async () => {
    const response = await call(`cipete utara ${counter}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ destinations: [{ id: 1, postcode: "12150" }] });
  });
  it("turns away someone who is not signed in, without spending a hit", async () => {
    user = null;
    const response = await call(`cipete ${counter}`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signIn" });
    expect(search).not.toHaveBeenCalled();
  });
  it("says a search is too short, or missing", async () => {
    for (const q of ["ab", null]) {
      const response = await call(q);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "tooShort" });
    }
    expect(search).not.toHaveBeenCalled();
  });
  it("is not available when the shop is misconfigured", async () => {
    mode.mockReturnValue("misconfigured");
    const response = await call(`cipete ${counter}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(search).not.toHaveBeenCalled();
  });
  it("lets the demo search, as the demo has no accounts to ask for", async () => {
    mode.mockReturnValue("demo");
    user = null;
    const response = await call(`cipete demo ${counter}`);
    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
