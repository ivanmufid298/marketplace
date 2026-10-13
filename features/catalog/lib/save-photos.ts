import type { SaveError } from "./db-errors";
import { allVariantKeys, newPhotoKey, photoKeyBelongsTo, variantKey } from "./image-variants";
import type { PhotoStorage } from "./photo-storage";
import type { ProductPhoto, ProductRepository } from "./product-repository";
import type { ResizedPhoto } from "./resize-image";

// Putting photos on a product touches two systems, files in Storage and rows in the database, and either can fail
// halfway. The order below keeps them consistent: files first, then the row that points at them, and anything already
// uploaded is removed again if a later step fails. A row never points at a file that is not there.

export type PhotoDraft = { resized: ResizedPhoto; alt: string };

export type AttachDeps = {
  storage: PhotoStorage;
  repo: Pick<ProductRepository, "addPhoto">;
  /** A fresh random id per photo (crypto.randomUUID()). */
  newId: () => string;
};

export type AttachFailure = { kind: "upload" } | SaveError;

export type AttachOutcome = {
  /** Photos that are fully saved. They stay saved even when a later one fails. */
  saved: ProductPhoto[];
  /** Set when a photo could not be saved; the photos after it were not tried. */
  failure?: AttachFailure;
};

/** Best effort: a failed cleanup must not hide the error that caused it. */
async function removeQuietly(storage: PhotoStorage, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await storage.remove(keys);
  } catch {
    // The files stay behind as orphans; they are harmless and can be removed from the Storage dashboard.
  }
}

/** Uploads each photo's sizes, then records it. `startOrder` is the display position of the first new photo. */
export async function attachPhotos(productId: number, startOrder: number, drafts: PhotoDraft[], deps: AttachDeps): Promise<AttachOutcome> {
  const saved: ProductPhoto[] = [];

  for (const [index, draft] of drafts.entries()) {
    const photoKey = newPhotoKey(productId, deps.newId(), draft.resized.extension);
    const uploaded: string[] = [];

    try {
      for (const variant of draft.resized.variants) {
        const key = variantKey(photoKey, variant.target);
        await deps.storage.upload(key, variant.blob, draft.resized.contentType);
        uploaded.push(key);
      }
    } catch {
      await removeQuietly(deps.storage, uploaded);
      return { saved, failure: { kind: "upload" } };
    }

    const largest = draft.resized.variants[draft.resized.variants.length - 1];
    const result = await deps.repo.addPhoto(productId, {
      objectKey: photoKey,
      alt: draft.alt,
      sortOrder: startOrder + index,
      width: largest.width,
      height: largest.height,
    });
    if (!result.ok) {
      await removeQuietly(deps.storage, uploaded);
      return { saved, failure: result.error };
    }
    saved.push(result.value);
  }

  return { saved };
}

export type RemoveDeps = {
  storage: PhotoStorage;
  repo: Pick<ProductRepository, "removePhoto">;
};

export type RemoveOutcome =
  | { ok: true; /** True when the row is gone but some files could not be deleted. */ orphans: boolean }
  | { ok: false; error: SaveError };

/**
 * Removes a photo: the row first, then its files. If the row cannot be removed the files stay, so the product keeps
 * working. Refuses a photo that does not belong to the product, so one product's form can never delete another's files.
 */
export async function removePhotoFully(productId: number, photo: ProductPhoto, deps: RemoveDeps): Promise<RemoveOutcome> {
  if (!photoKeyBelongsTo(photo.objectKey, productId)) return { ok: false, error: { kind: "forbidden" } };

  const result = await deps.repo.removePhoto(photo.id);
  if (!result.ok) return { ok: false, error: result.error };

  try {
    await deps.storage.remove(allVariantKeys(photo.objectKey));
    return { ok: true, orphans: false };
  } catch {
    return { ok: true, orphans: true };
  }
}
