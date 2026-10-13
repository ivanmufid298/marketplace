// Run with `npm run test:ui`. Shrinking a transfer proof before it is sent. The canvas work is the catalog's resizePhoto,
// replaced here by a fake, so only the decisions made around it are tested.
import { describe, expect, it, vi } from "vitest";
import { ResizeFailure, type ResizedPhoto } from "@/features/catalog";
import { prepareProof, ProofPrepareError } from "./prepare-proof";

const resized = (over: Partial<ResizedPhoto> = {}): ResizedPhoto => ({
  extension: "webp", contentType: "image/webp", sourceWidth: 3000, sourceHeight: 2000,
  variants: [400, 800, 1600].map((target) => ({ target: target as 400, width: target, height: target / 2, blob: new Blob([new Uint8Array(target)], { type: "image/webp" }) })),
  ...over,
});
const png = (name = "screenshot.png") => new File([new Uint8Array(10)], name, { type: "image/png" });

describe("prepareProof", () => {
  it("sends a PDF as it is", async () => {
    const pdf = new File([new Uint8Array(5)], "struk.pdf", { type: "application/pdf" });
    const resize = vi.fn();
    expect(await prepareProof(pdf, resize as never)).toBe(pdf);
    expect(resize).not.toHaveBeenCalled();
  });
  it("sends the largest size of a photo, as a WebP file named after the original", async () => {
    const resize = vi.fn(async () => resized());
    const out = await prepareProof(png("bukti transfer.PNG"), resize as never);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("bukti transfer.webp");
    expect(out.size).toBe(1600);
  });
  it("names a JPEG fallback .jpg", async () => {
    const resize = vi.fn(async () => resized({ extension: "jpg", contentType: "image/jpeg" }));
    const out = await prepareProof(png(), resize as never);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("screenshot.jpg");
  });
  it("copes with a name that has no extension or dots in it", async () => {
    const resize = vi.fn(async () => resized());
    expect((await prepareProof(png("foto"), resize as never)).name).toBe("foto.webp");
    expect((await prepareProof(png("a.b.c.png"), resize as never)).name).toBe("a.b.c.webp");
    expect((await prepareProof(png(".png"), resize as never)).name).toBe("bukti.webp");
  });
  it("says why the photo cannot be used", async () => {
    const reason = async (r: ConstructorParameters<typeof ResizeFailure>[0]) => {
      const resize = vi.fn(async () => { throw new ResizeFailure(r); });
      return prepareProof(png(), resize as never).catch((e) => (e instanceof ProofPrepareError ? e.reason : "other"));
    };
    expect(await reason("type")).toBe("proofType");
    expect(await reason("size")).toBe("proofSize");
    expect(await reason("empty")).toBe("proofSize");
    expect(await reason("unreadable")).toBe("proofUnreadable");
  });
  it("says unreadable for any other failure", async () => {
    const resize = vi.fn(async () => { throw new Error("boom"); });
    await expect(prepareProof(png(), resize as never)).rejects.toMatchObject({ reason: "proofUnreadable" });
  });
  it("sends the original when the browser cannot encode a smaller one", async () => {
    const original = png();
    const resize = vi.fn(async () => { throw new ResizeFailure("encode"); });
    expect(await prepareProof(original, resize as never)).toBe(original);
  });
});
