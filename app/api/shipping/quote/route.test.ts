// Run with `npm run test:ui`. The shipping-quote address as the browser meets it: who gets an answer, and that the provider's key and the signing
// secret come from the server's environment.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mode = vi.fn(() => "supabase" as "supabase" | "demo" | "misconfigured");
let user: { id: string } | null = { id: "buyer-1" };
const tables: Record<string, unknown> = {
  shop_settings: { origin_destination_id: 17549, origin_label: "KEBAYORAN", couriers: ["jne"], free_shipping_min: null, shipping_markup: 0 },
  products: [{ id: 1, price: 89000, weight_gram: 500 }],
};
const quote = vi.fn(async () => ({ ok: true as const, value: [{ courier: "jne", courierName: "JNE", service: "REG", description: "Reguler", fee: 9000, etd: "1-2 day" }] }));
const providerKeys: (string | undefined)[] = [];

vi.mock("@/features/auth/server", () => ({ authMode: () => mode() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      const chain: unknown = new Proxy({}, { get(_t, prop) { if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? null, error: null }).then(resolve); return () => chain; } });
      return chain;
    },
  }),
}));
vi.mock("@/features/shipping/server", async (importActual) => {
  const actual = await importActual<typeof import("@/features/shipping/server")>();
  return { ...actual, shippingProvider: () => { providerKeys.push(process.env.RAJAONGKIR_API_KEY); return { searchDestinations: vi.fn(), quote }; } };
});

const { POST } = await import("./route");
const call = (body: unknown) => POST(new NextRequest("http://localhost/api/shipping/quote", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const good = { destinationId: 17536, items: [{ productId: 1, qty: 2 }] };

beforeEach(() => {
  mode.mockReturnValue("supabase");
  user = { id: "buyer-1" };
  quote.mockClear();
  providerKeys.length = 0;
  vi.stubEnv("SHIPPING_QUOTE_SECRET", "a-secret-for-the-test");
  vi.stubEnv("RAJAONGKIR_API_KEY", "the-key");
});

describe("POST /api/shipping/quote", () => {
  it("answers a signed-in buyer with the services and a token for each, and never lets a browser or a proxy keep it", async () => {
    const response = await call(good);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ weightGram: 1000, subtotal: 178000, options: [{ courier: "jne", service: "REG", fee: 9000 }] });
    expect(body.options[0].token).toMatch(/^[\w-]+\.[\w-]+$/);
  });
  it("turns away someone who is not signed in, without asking the provider", async () => {
    user = null;
    const response = await call(good);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signIn" });
    expect(quote).not.toHaveBeenCalled();
  });
  it("is not available without a database to read the cart from (the demo, or a shop that is misconfigured)", async () => {
    for (const m of ["demo", "misconfigured"] as const) {
      mode.mockReturnValue(m);
      const response = await call(good);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    }
    expect(quote).not.toHaveBeenCalled();
  });
  it("says it is not a cart for something that is not JSON, or not a cart", async () => {
    for (const bad of ["not json", "", { destinationId: 1 }, { items: [] }]) {
      const response = await call(bad);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid" });
    }
  });
  it("signs with the secret from the environment, and says it is not set up when there is none", async () => {
    vi.stubEnv("SHIPPING_QUOTE_SECRET", "");
    const response = await call(good);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "notConfigured" });
    expect(quote).not.toHaveBeenCalled();
  });
  it("gives the provider the key from the environment", async () => {
    await call(good);
    expect(providerKeys).toEqual(["the-key"]);
  });
});
