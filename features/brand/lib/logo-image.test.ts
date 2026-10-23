// Run with `npm run test:ui`. Preparing the picked picture as the logo: what is accepted, how big it ends up, and what happens when the browser cannot do it.
import { describe, expect, it, vi } from "vitest";
import { checkLogoFile, LOGO_SIZES, LogoFailure, MAX_LOGO_BYTES, MAX_LOGO_SOURCE_BYTES, planLogoSize, prepareLogo, type LogoDeps } from "./logo-image";

const file = (type = "image/png", size = 1000) => new File([new Uint8Array(size)], "logo", { type });
const png = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

function deps(over: { width?: number; height?: number; sizes?: (longest: number) => Blob | null; decodeFails?: boolean } = {}) {
  const release = vi.fn();
  const encodePng = vi.fn(async (_i: unknown, width: number, height: number) => (over.sizes ? over.sizes(Math.max(width, height)) : png(100)));
  const d: LogoDeps = {
    decode: vi.fn(async () => { if (over.decodeFails) throw new Error("bad"); return { width: over.width ?? 2000, height: over.height ?? 1000, release }; }),
    encodePng,
  };
  return { d, release, encodePng };
}
const fails = async (promise: Promise<unknown>, reason: string) => {
  const error = await promise.then(() => null, (e) => e);
  expect(error).toBeInstanceOf(LogoFailure);
  expect((error as LogoFailure).reason).toBe(reason);
};

describe("the limits", () => {
  it("match the bucket: a logo is at most 1 MB, and the sizes tried go from 512 px down to 128", () => {
    expect(MAX_LOGO_BYTES).toBe(1_048_576);
    expect([...LOGO_SIZES]).toEqual([512, 384, 256, 128]);
  });
});

describe("planLogoSize", () => {
  it("fits the longest side, keeping the shape", () => {
    expect(planLogoSize(2000, 1000, 512)).toEqual({ width: 512, height: 256 });
    expect(planLogoSize(1000, 2000, 512)).toEqual({ width: 256, height: 512 });
    expect(planLogoSize(1024, 1024, 512)).toEqual({ width: 512, height: 512 });
  });
  it("never makes a small picture bigger", () => {
    expect(planLogoSize(200, 100, 512)).toEqual({ width: 200, height: 100 });
    expect(planLogoSize(512, 512, 512)).toEqual({ width: 512, height: 512 });
  });
  it("never goes below one pixel on a side", () => {
    expect(planLogoSize(10000, 1, 128)).toEqual({ width: 128, height: 1 });
    expect(planLogoSize(1, 10000, 128)).toEqual({ width: 1, height: 128 });
  });
  it.each([[0, 10], [10, 0], [-1, 5], [NaN, 5], [5, Infinity]])("refuses %j", (w, h) => expect(() => planLogoSize(w, h, 512)).toThrow());
});

describe("checkLogoFile", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s", (type) => expect(checkLogoFile({ type, size: 1000 })).toBeNull());
  it.each(["image/svg+xml", "image/gif", "application/pdf", "text/html", ""])("refuses the type %j (an SVG can carry scripts, and email programs do not show it)", (type) => expect(checkLogoFile({ type, size: 1000 })).toBe("logoType"));
  it("refuses an empty file and one over 10 MB, and accepts exactly 10 MB", () => {
    expect(checkLogoFile({ type: "image/png", size: 0 })).toBe("logoSize");
    expect(checkLogoFile({ type: "image/png", size: MAX_LOGO_SOURCE_BYTES + 1 })).toBe("logoSize");
    expect(checkLogoFile({ type: "image/png", size: MAX_LOGO_SOURCE_BYTES })).toBeNull();
    expect(MAX_LOGO_SOURCE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("prepareLogo", () => {
  it("gives a PNG no longer than 512 px on its longest side, shrinking a big picture", async () => {
    const { d, encodePng } = deps({ width: 4000, height: 2000 });
    const blob = await prepareLogo(file(), d);
    expect(blob.type).toBe("image/png");
    expect(encodePng).toHaveBeenCalledTimes(1);
    expect(encodePng.mock.calls[0].slice(1)).toEqual([512, 256]);
  });
  it("keeps a small picture at its own size", async () => {
    const { d, encodePng } = deps({ width: 300, height: 300 });
    await prepareLogo(file(), d);
    expect(encodePng.mock.calls[0].slice(1)).toEqual([300, 300]);
  });
  it("tries smaller sizes while the file is too heavy for the bucket, and stops at the first that fits", async () => {
    const { d, encodePng } = deps({ width: 2000, height: 2000, sizes: (longest) => png(longest > 256 ? MAX_LOGO_BYTES + 1 : MAX_LOGO_BYTES) });
    const blob = await prepareLogo(file(), d);
    expect(encodePng.mock.calls.map((c) => c[1])).toEqual([512, 384, 256]);
    expect(blob.size).toBe(MAX_LOGO_BYTES);
  });
  it("says it is too big when even the smallest size is too heavy", async () => {
    const { d, encodePng } = deps({ width: 2000, height: 2000, sizes: () => png(MAX_LOGO_BYTES + 1) });
    await fails(prepareLogo(file(), d), "logoSize");
    expect(encodePng).toHaveBeenCalledTimes(LOGO_SIZES.length);
  });
  it("refuses a file of the wrong type or size before decoding anything", async () => {
    const { d } = deps();
    await fails(prepareLogo(file("image/svg+xml"), d), "logoType");
    await fails(prepareLogo(file("image/png", 0), d), "logoSize");
    expect(d.decode).not.toHaveBeenCalled();
  });
  it("says so when the file cannot be read as a picture, or has no pixels", async () => {
    await fails(prepareLogo(file(), deps({ decodeFails: true }).d), "logoUnreadable");
    const empty = deps({ width: 0, height: 0 });
    await fails(prepareLogo(file(), empty.d), "logoUnreadable");
    expect(empty.release).toHaveBeenCalled();
  });
  it("says the browser cannot encode when it gives nothing, an empty file, or another type", async () => {
    await fails(prepareLogo(file(), deps({ sizes: () => null }).d), "logoEncode");
    await fails(prepareLogo(file(), deps({ sizes: () => png(0) }).d), "logoEncode");
    await fails(prepareLogo(file(), deps({ sizes: () => new Blob([new Uint8Array(10)], { type: "image/webp" }) }).d), "logoEncode");
  });
  it("always lets go of the decoded picture, whatever happened", async () => {
    for (const d of [deps(), deps({ sizes: () => null }), deps({ sizes: () => png(MAX_LOGO_BYTES + 1) })]) {
      await prepareLogo(file(), d.d).catch(() => undefined);
      expect(d.release).toHaveBeenCalledTimes(1);
    }
  });
});
