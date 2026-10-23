// Turns the picture the admin picks into the logo that is stored: a PNG (email programs show PNG best), no larger than 512 px on its longest
// side, and small enough for the bucket. The parts that need the browser (decoding and encoding through a canvas) are passed in as `deps`,
// so the decisions around them are tested without one.

export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** The biggest picture the admin may pick. It is shrunk before it is stored. */
export const MAX_LOGO_SOURCE_BYTES = 10 * 1024 * 1024;
/** What the bucket holds, as the database enforces it. */
export const MAX_LOGO_BYTES = 1024 * 1024;
/** The longest side of the stored logo, and the smaller sizes tried if that is still too heavy for the bucket. */
export const LOGO_SIZES = [512, 384, 256, 128] as const;

export type LogoProblem = "logoType" | "logoSize" | "logoUnreadable" | "logoEncode";
export type DecodedImage = { width: number; height: number; release(): void };
export type LogoDeps = {
  /** Decodes the file, honoring its orientation. Rejects when it is not a readable image. */
  decode(file: Blob): Promise<DecodedImage>;
  /** Draws the image at the given size and encodes it as PNG. Resolves null when the browser cannot. */
  encodePng(image: DecodedImage, width: number, height: number): Promise<Blob | null>;
};
export class LogoFailure extends Error {
  constructor(readonly reason: LogoProblem) {
    super(`logo failed: ${reason}`);
  }
}

/** Fits the picture inside `longest` pixels on its longest side, keeping its shape; never makes it bigger. */
export function planLogoSize(width: number, height: number, longest: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error("planLogoSize needs a positive width and height");
  const scale = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Checks the picked file before any work is done. `null` means it is fine. */
export function checkLogoFile(file: { type: string; size: number }): LogoProblem | null {
  if (!(ACCEPTED_LOGO_TYPES as readonly string[]).includes(file.type)) return "logoType";
  if (file.size < 1 || file.size > MAX_LOGO_SOURCE_BYTES) return "logoSize";
  return null;
}

/** The stored logo for a picked file. Throws LogoFailure with a reason the form can show. */
export async function prepareLogo(file: File, deps: LogoDeps = browserLogoDeps): Promise<Blob> {
  const problem = checkLogoFile(file);
  if (problem) throw new LogoFailure(problem);
  let image: DecodedImage;
  try {
    image = await deps.decode(file);
  } catch {
    throw new LogoFailure("logoUnreadable");
  }
  try {
    if (!(image.width >= 1 && image.height >= 1)) throw new LogoFailure("logoUnreadable");
    let heavy = false;
    for (const longest of LOGO_SIZES) {
      const size = planLogoSize(image.width, image.height, longest);
      const blob = await deps.encodePng(image, size.width, size.height);
      // Some browsers hand back another type instead of failing, so the type has to be checked.
      if (!blob || blob.type !== "image/png" || blob.size === 0) throw new LogoFailure("logoEncode");
      if (blob.size <= MAX_LOGO_BYTES) return blob;
      heavy = true;
    }
    throw new LogoFailure(heavy ? "logoSize" : "logoEncode");
  } finally {
    image.release();
  }
}

/** The real thing, using createImageBitmap and a canvas. Only called from the browser. */
export const browserLogoDeps: LogoDeps = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, release: () => bitmap.close(), bitmap } as DecodedImage & { bitmap: ImageBitmap };
  },
  async encodePng(image, width, height) {
    const bitmap = (image as DecodedImage & { bitmap?: ImageBitmap }).bitmap;
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  },
};
