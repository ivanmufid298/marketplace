// Run with `npm run test:ui`. The address emails point their header picture at: always a PNG, the same for everyone, kept for a short time.
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadLogo = vi.fn();
vi.mock("@/features/brand/server", () => ({ loadLogo: (env: unknown) => loadLogo(env) }));

const { GET } = await import("./route");

beforeEach(() => { loadLogo.mockReset(); vi.unstubAllEnvs(); });

describe("GET /brand/logo", () => {
  it("answers with the logo as a PNG that is kept for five minutes, and told not to be guessed at", async () => {
    loadLogo.mockResolvedValue({ bytes: Uint8Array.from([1, 2, 3]), custom: true });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=3600");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it("asks for the logo of the database this build is connected to", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    loadLogo.mockResolvedValue({ bytes: Uint8Array.from([9]), custom: false });
    await GET();
    expect(loadLogo).toHaveBeenCalledWith({ supabaseUrl: "https://x.supabase.co", anonKey: "anon" });
  });
  it("sets no cookie, so a shared cache may keep it", async () => {
    loadLogo.mockResolvedValue({ bytes: Uint8Array.from([1]), custom: false });
    expect((await GET()).headers.get("Set-Cookie")).toBeNull();
  });
});
