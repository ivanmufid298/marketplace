// Run with `npm run test:ui`. The logo shown until the shop uploads its own is a real PNG.
import { describe, expect, it } from "vitest";
import { defaultLogoBytes } from "./default-logo";

describe("the default logo", () => {
  const bytes = defaultLogoBytes();
  it("is a PNG: it starts with the PNG signature and ends with the IEND chunk", () => {
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new TextDecoder().decode(bytes.slice(-8, -4))).toBe("IEND");
  });
  it("is 256 by 256 pixels and small", () => {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([256, 256]);
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.length).toBeLessThan(10_000);
  });
  it("gives a fresh copy each time, so no one can change it for the next", () => {
    const a = defaultLogoBytes();
    a[0] = 0;
    expect(defaultLogoBytes()[0]).toBe(0x89);
  });
});
