// Run with `npm run test:ui`. The decisions around resizing a product photo, with a fake decoder and encoder in place
// of the browser's canvas, so format fallback and failure handling are covered without a real image.
import { describe, expect, it, vi } from "vitest";
import { MAX_SOURCE_BYTES } from "./image-variants";
import { resizePhoto, ResizeFailure, type DecodedImage, type ResizeDeps } from "./resize-image";

const file = (type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], "foto", { type });

type Encoded = Blob | null;
function fakeDeps(opts: { width?: number; height?: number; decodeFails?: boolean; encode?: (type: string, call: number) => Encoded } = {}) {
  const { width = 4000, height = 3000, decodeFails = false, encode } = opts;
  const release = vi.fn();
  const calls: { width: number; height: number; type: string; quality: number }[] = [];
  const deps: ResizeDeps = {
    async decode() {
      if (decodeFails) throw new Error("not an image");
      return { width, height, release } satisfies DecodedImage;
    },
    async encode(_image, w, h, type, quality) {
      calls.push({ width: w, height: h, type, quality });
      if (encode) return encode(type, calls.length);
      return new Blob([new Uint8Array(10)], { type });
    },
  };
  return { deps, release, calls };
}

describe("resizePhoto", () => {
  it("returns every size as WebP and releases the decoded image", async () => {
    const { deps, release, calls } = fakeDeps();
    const result = await resizePhoto(file(), deps);
    expect(result.extension).toBe("webp");
    expect(result.contentType).toBe("image/webp");
    expect(result.sourceWidth).toBe(4000);
    expect(result.sourceHeight).toBe(3000);
    expect(result.variants.map((v) => [v.target, v.width, v.height])).toEqual([[400, 400, 300], [800, 800, 600], [1600, 1600, 1200]]);
    expect(result.variants.every((v) => v.blob.type === "image/webp")).toBe(true);
    expect(calls).toHaveLength(3);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("asks the encoder for the planned size and a WebP quality", async () => {
    const { deps, calls } = fakeDeps({ width: 1000, height: 500 });
    await resizePhoto(file(), deps);
    expect(calls.map((c) => [c.width, c.height])).toEqual([[400, 200], [800, 400], [1000, 500]]);
    expect(calls.every((c) => c.type === "image/webp" && c.quality > 0.5 && c.quality < 1)).toBe(true);
  });

  it("does not scale a small photo up", async () => {
    const { deps } = fakeDeps({ width: 300, height: 200 });
    const result = await resizePhoto(file(), deps);
    expect(result.variants.map((v) => [v.width, v.height])).toEqual([[300, 200], [300, 200], [300, 200]]);
  });

  it("uses JPEG for the whole set when the browser hands back another format for WebP", async () => {
    const { deps, calls } = fakeDeps({ encode: (type) => new Blob([new Uint8Array(10)], { type: type === "image/webp" ? "image/png" : type }) });
    const result = await resizePhoto(file(), deps);
    expect(result.extension).toBe("jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.variants.every((v) => v.blob.type === "image/jpeg")).toBe(true);
    expect(calls.filter((c) => c.type === "image/jpeg")).toHaveLength(3);
  });

  it("uses JPEG when the encoder cannot produce WebP at all", async () => {
    const { deps } = fakeDeps({ encode: (type) => (type === "image/webp" ? null : new Blob([new Uint8Array(10)], { type })) });
    expect((await resizePhoto(file(), deps)).extension).toBe("jpg");
  });

  it("never mixes formats: one failed WebP size sends the whole set to JPEG", async () => {
    const { deps } = fakeDeps({ encode: (type, call) => (type === "image/webp" && call === 2 ? null : new Blob([new Uint8Array(10)], { type })) });
    const result = await resizePhoto(file(), deps);
    expect(result.extension).toBe("jpg");
    expect(new Set(result.variants.map((v) => v.blob.type)).size).toBe(1);
  });

  it("treats an empty blob as a failed encode", async () => {
    const { deps } = fakeDeps({ encode: (type) => (type === "image/webp" ? new Blob([], { type }) : new Blob([new Uint8Array(10)], { type })) });
    expect((await resizePhoto(file(), deps)).extension).toBe("jpg");
  });

  it("fails with 'encode' when neither format works, and still releases the image", async () => {
    const { deps, release } = fakeDeps({ encode: () => null });
    await expect(resizePhoto(file(), deps)).rejects.toMatchObject({ reason: "encode" });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("fails with 'unreadable' when the file cannot be decoded", async () => {
    const { deps } = fakeDeps({ decodeFails: true });
    await expect(resizePhoto(file(), deps)).rejects.toMatchObject({ reason: "unreadable" });
  });

  it("fails with 'unreadable' for an image that decodes to zero pixels, and releases it", async () => {
    const { deps, release } = fakeDeps({ width: 0, height: 0 });
    await expect(resizePhoto(file(), deps)).rejects.toMatchObject({ reason: "unreadable" });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rejects the wrong type before decoding anything", async () => {
    const decode = vi.fn();
    await expect(resizePhoto(file("image/gif"), { decode, encode: vi.fn() })).rejects.toMatchObject({ reason: "type" });
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before decoding anything", async () => {
    const decode = vi.fn();
    const big = { type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 } as File;
    await expect(resizePhoto(big, { decode, encode: vi.fn() })).rejects.toMatchObject({ reason: "size" });
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    await expect(resizePhoto(file("image/png", 0), fakeDeps().deps)).rejects.toMatchObject({ reason: "empty" });
  });

  it("throws a ResizeFailure the form can recognize", async () => {
    await expect(resizePhoto(file("image/gif"), fakeDeps().deps)).rejects.toBeInstanceOf(ResizeFailure);
  });
});
