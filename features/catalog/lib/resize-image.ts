import { checkSourceFile, planVariants, type PhotoExtension, type PlannedVariant, type SourceFileProblem, type VariantWidth } from "./image-variants";

// Turns a picked photo into the fixed set of sizes, in the browser. The pieces that need the DOM (decoding and
// encoding through a canvas) are passed in as `deps`, so the decisions around them are tested without a browser.

const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

export type DecodedImage = { width: number; height: number; release(): void };

export type ResizeDeps = {
  /** Decodes the file, honoring the EXIF orientation. Rejects when the file is not a readable image. */
  decode(file: Blob): Promise<DecodedImage>;
  /** Draws the decoded image at the given size and encodes it. Resolves null when the browser cannot encode `type`. */
  encode(image: DecodedImage, width: number, height: number, type: "image/webp" | "image/jpeg", quality: number): Promise<Blob | null>;
};

export type ResizedVariant = PlannedVariant & { blob: Blob };

export type ResizedPhoto = {
  extension: PhotoExtension;
  contentType: "image/webp" | "image/jpeg";
  /** Size of the original, for the form's hint and for the database. */
  sourceWidth: number;
  sourceHeight: number;
  variants: ResizedVariant[];
};

export type ResizeError = SourceFileProblem | "unreadable" | "encode";
export class ResizeFailure extends Error {
  constructor(readonly reason: ResizeError) {
    super(`resize failed: ${reason}`);
  }
}

async function encodeAll(image: DecodedImage, plan: PlannedVariant[], type: "image/webp" | "image/jpeg", deps: ResizeDeps): Promise<ResizedVariant[] | null> {
  const quality = type === "image/webp" ? WEBP_QUALITY : JPEG_QUALITY;
  const out: ResizedVariant[] = [];
  for (const step of plan) {
    const blob = await deps.encode(image, step.width, step.height, type, quality);
    // Some browsers hand back PNG when asked for WebP instead of failing, so the type has to be checked.
    if (!blob || blob.type !== type || blob.size === 0) return null;
    out.push({ ...step, blob });
  }
  return out;
}

/**
 * Produces every size of a photo as WebP, or as JPEG for the whole set if the browser cannot encode WebP. All sizes of
 * one photo share a format so a single key describes them. Throws ResizeFailure with a reason the form can show.
 */
export async function resizePhoto(file: File, deps: ResizeDeps = browserDeps): Promise<ResizedPhoto> {
  const problem = checkSourceFile(file);
  if (problem) throw new ResizeFailure(problem);

  let image: DecodedImage;
  try {
    image = await deps.decode(file);
  } catch {
    throw new ResizeFailure("unreadable");
  }

  try {
    let plan: PlannedVariant[];
    try {
      plan = planVariants(image.width, image.height);
    } catch {
      // Decoded, but with no pixels: treat it like a file that cannot be read.
      throw new ResizeFailure("unreadable");
    }
    const webp = await encodeAll(image, plan, "image/webp", deps);
    if (webp) return { extension: "webp", contentType: "image/webp", sourceWidth: image.width, sourceHeight: image.height, variants: webp };
    const jpeg = await encodeAll(image, plan, "image/jpeg", deps);
    if (jpeg) return { extension: "jpg", contentType: "image/jpeg", sourceWidth: image.width, sourceHeight: image.height, variants: jpeg };
    throw new ResizeFailure("encode");
  } finally {
    image.release();
  }
}

/** The real thing, using createImageBitmap and a canvas. Only called from the browser. */
export const browserDeps: ResizeDeps = {
  async decode(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, release: () => bitmap.close(), bitmap } as DecodedImage & { bitmap: ImageBitmap };
  },
  async encode(image, width, height, type, quality) {
    const bitmap = (image as DecodedImage & { bitmap?: ImageBitmap }).bitmap;
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // High quality smoothing matters most when shrinking a large photo a lot.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  },
};

export type { VariantWidth };
