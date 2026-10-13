// Product photos are resized in the admin's browser into a few fixed sizes before they are uploaded (PRD 4, "Foto
// produk"): the files are small, nothing is resized on demand, and it works on any host. This file holds the rules.
// It has no DOM or network code, so it runs in plain Node tests.

/** Widths in pixels. 400 for grids, 800 for the detail view, 1600 for zoom. */
export const VARIANT_WIDTHS = [400, 800, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

/** Largest original the admin may pick. Phone photos are usually 3 to 8 MB. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Below this width the biggest variants would be blurry, so the admin is told. */
export const RECOMMENDED_MIN_WIDTH = 800;

export type PlannedVariant = {
  /** The size this file is named after, one of VARIANT_WIDTHS. */
  target: VariantWidth;
  /** Real pixel size. Never larger than the original: a photo is not scaled up. */
  width: number;
  height: number;
};

/**
 * One variant per target width. A target wider than the original keeps the original size, so a small photo yields
 * several identical files rather than blurry upscales, and every size name the storefront asks for exists.
 */
export function planVariants(sourceWidth: number, sourceHeight: number): PlannedVariant[] {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth < 1 || sourceHeight < 1) {
    throw new Error("planVariants needs a positive width and height");
  }
  return VARIANT_WIDTHS.map((target) => {
    const width = Math.min(target, Math.round(sourceWidth));
    const height = Math.max(1, Math.round((sourceHeight * width) / sourceWidth));
    return { target, width, height };
  });
}

export type SourceFileProblem = "type" | "size" | "empty";

/** Checks the picked file before any work is done. `null` means it is fine. */
export function checkSourceFile(file: { type: string; size: number }): SourceFileProblem | null {
  if (!(ACCEPTED_SOURCE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > MAX_SOURCE_BYTES) return "size";
  return null;
}

export const isTooSmallForBestQuality = (sourceWidth: number) => sourceWidth < RECOMMENDED_MIN_WIDTH;

export type PhotoExtension = "webp" | "jpg";

/**
 * Key that identifies one photo. Its extension is the format of every size, and the sizes are stored next to it:
 * `products/12/ab12.webp` has `products/12/ab12-400.webp`, `-800.webp`, and `-1600.webp`. The database keeps this one
 * key, so no format column is needed. `id` is a fresh random id (crypto.randomUUID()) so uploads never overwrite.
 */
export function newPhotoKey(productId: number, id: string, extension: PhotoExtension): string {
  if (!Number.isInteger(productId) || productId < 1) throw new Error("newPhotoKey needs a saved product id");
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new Error("newPhotoKey needs a plain id");
  return `products/${productId}/${id}.${extension}`;
}

/** The storage key of one size of a photo. */
export function variantKey(photoKey: string, target: VariantWidth): string {
  const dot = photoKey.lastIndexOf(".");
  if (dot < 1 || dot === photoKey.length - 1) throw new Error(`Not a photo key: ${photoKey}`);
  return `${photoKey.slice(0, dot)}-${target}${photoKey.slice(dot)}`;
}

export const allVariantKeys = (photoKey: string) => VARIANT_WIDTHS.map((w) => variantKey(photoKey, w));

/** Public URL of one object in a public bucket. */
export function publicObjectUrl(supabaseUrl: string, bucket: string, key: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/** `srcset` text for a photo: every size with its width descriptor. */
export function buildSrcSet(urlFor: (target: VariantWidth) => string): string {
  return VARIANT_WIDTHS.map((w) => `${urlFor(w)} ${w}w`).join(", ");
}

/** True when `key` belongs to `productId`, so one product's form can never delete another's files. */
export const photoKeyBelongsTo = (key: string, productId: number) => key.startsWith(`products/${productId}/`);
