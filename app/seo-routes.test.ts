// Run with `npm run test:ui`. What search engines are told: the sitemap and robots.txt.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entries = vi.fn();
vi.mock("@/features/catalog/server", () => ({ listStoreSitemapEntries: () => entries() }));

const { default: sitemap } = await import("./sitemap");
const { default: robots } = await import("./robots");

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://tokoku.id"));
afterEach(() => vi.unstubAllEnvs());

describe("sitemap", () => {
  it("lists the home page and every product page with its last change", async () => {
    entries.mockResolvedValue([{ slug: "mug", updatedAt: "2026-10-01T00:00:00Z" }, { slug: "tote", updatedAt: "2026-10-02T00:00:00Z" }]);
    const map = await sitemap();
    expect(map.map((e) => e.url)).toEqual(["https://tokoku.id", "https://tokoku.id/produk/mug", "https://tokoku.id/produk/tote"]);
    expect(map[1].lastModified).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(map[0]).not.toHaveProperty("lastModified");
  });
  it("still lists the home page when there are no products", async () => {
    entries.mockResolvedValue([]);
    expect((await sitemap()).map((e) => e.url)).toEqual(["https://tokoku.id"]);
  });
});

describe("robots", () => {
  it("lets everyone in except the admin, the buyer's own account page, and the email-link pages, and points to the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/admin", "/akun", "/reset-password", "/lupa-sandi"] });
    expect(r.sitemap).toBe("https://tokoku.id/sitemap.xml");
  });
});
