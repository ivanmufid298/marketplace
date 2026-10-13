// Run with `npm run test:ui`. Which address the site calls itself.
import { describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

describe("siteUrl", () => {
  it("prefers the configured site address, without a trailing slash", () => {
    expect(siteUrl({ site: "https://tokoku.id/", vercelProduction: "x.vercel.app" })).toBe("https://tokoku.id");
    expect(siteUrl({ site: "  https://tokoku.id///  " })).toBe("https://tokoku.id");
  });
  it("falls back to the Vercel production address, adding https", () => {
    expect(siteUrl({ vercelProduction: "market-by-kith.vercel.app" })).toBe("https://market-by-kith.vercel.app");
    expect(siteUrl({ site: "  ", vercelProduction: "https://a.vercel.app/" })).toBe("https://a.vercel.app");
  });
  it("falls back to localhost", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ site: "", vercelProduction: " " })).toBe("http://localhost:3000");
  });
});
