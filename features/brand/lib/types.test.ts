// Run with `npm run test:ui`. The logo's key and address: the shapes the database and the bucket expect.
import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_SHOP_NAME, LOGO_KEY_PATTERN, logoKeyFor, publicLogoUrl } from "./types";

const ID = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";

describe("logo keys", () => {
  it("are made from an id and accepted by the pattern the database uses", () => {
    expect(logoKeyFor(ID)).toBe(`logo/${ID}.png`);
    expect(LOGO_KEY_PATTERN.test(logoKeyFor(ID))).toBe(true);
  });
  it.each(["logo/abc.png", `other/${ID}.png`, `logo/${ID}.jpg`, `logo/${ID.toUpperCase()}.png`, `/logo/${ID}.png`, `logo/${ID}.png/x`, `logo/../${ID}.png`, `logo/${ID}.pngx`, ""])("refuses %j", (key) => expect(LOGO_KEY_PATTERN.test(key)).toBe(false));
});

describe("publicLogoUrl", () => {
  it("is the file's address in the public logo bucket, whether or not the base ends with a slash", () => {
    expect(publicLogoUrl("https://x.supabase.co", `logo/${ID}.png`)).toBe(`https://x.supabase.co/storage/v1/object/public/shop-brand/logo/${ID}.png`);
    expect(publicLogoUrl("https://x.supabase.co//", `logo/${ID}.png`)).toBe(`https://x.supabase.co/storage/v1/object/public/shop-brand/logo/${ID}.png`);
  });
  it("encodes what must be encoded in each part of the key", () => {
    expect(publicLogoUrl("https://x.co", "logo/a b#c.png")).toBe("https://x.co/storage/v1/object/public/shop-brand/logo/a%20b%23c.png");
  });
});

describe("the default profile", () => {
  it("is named Market by Kith and has no logo", () => {
    expect(DEFAULT_SHOP_NAME).toBe("Market by Kith");
    expect(DEFAULT_PROFILE).toEqual({ name: "Market by Kith", logoKey: null });
  });
});
