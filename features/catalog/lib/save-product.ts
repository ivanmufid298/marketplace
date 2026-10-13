import type { SaveError } from "./db-errors";
import type { ProductInput } from "./product-form";
import type { AdminProduct, ProductPhoto } from "./product-repository";
import type { CatalogServices } from "./services";
import { attachPhotos, removePhotoFully, type AttachFailure, type PhotoDraft } from "./save-photos";

// Saving a product from the form is several steps against two systems. The product itself is the one step that must
// succeed; everything after it is reported as a warning, because by then the product exists and the admin can finish
// the rest by editing it. Nothing is rolled back across steps, so one broken photo never costs the admin their form.

export type SaveProductArgs = {
  /** null creates a new product. */
  productId: number | null;
  input: ProductInput;
  /** Photos the admin chose to delete from an existing product. */
  removed: ProductPhoto[];
  /** The remaining existing photos in the order the admin arranged them. */
  keptInOrder: ProductPhoto[];
  /** Newly picked photos, already resized, in the order to add them after the kept ones. */
  added: PhotoDraft[];
};

export type SaveWarning =
  | { step: "remove"; photoId: number; error: SaveError }
  | { step: "orphans"; photoId: number }
  | { step: "order"; error: SaveError }
  | { step: "upload"; failure: AttachFailure; saved: number; attempted: number }
  | { step: "reload"; error: SaveError };

export type SaveProductOutcome =
  | { ok: true; product: AdminProduct; created: boolean; warnings: SaveWarning[] }
  | { ok: false; error: SaveError };

const sameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export async function saveProduct(services: CatalogServices, args: SaveProductArgs): Promise<SaveProductOutcome> {
  const { repo, storage, newId } = services;
  const warnings: SaveWarning[] = [];

  // 1. The product row. This is the only step whose failure fails the whole save.
  const saved = args.productId === null ? await repo.createProduct(args.input) : await repo.updateProduct(args.productId, args.input);
  if (!saved.ok) return { ok: false, error: saved.error };
  const product = saved.value;

  // 2. Photos the admin removed: row first, then files.
  for (const photo of args.removed) {
    const outcome = await removePhotoFully(product.id, photo, { storage, repo });
    if (!outcome.ok) warnings.push({ step: "remove", photoId: photo.id, error: outcome.error });
    else if (outcome.orphans) warnings.push({ step: "orphans", photoId: photo.id });
  }

  // 3. Keep the arranged order. Only when it differs from what is stored, and never touching photos that were removed.
  const stored = product.photos.map((p) => p.id).filter((id) => args.keptInOrder.some((k) => k.id === id));
  const wanted = args.keptInOrder.map((p) => p.id);
  if (!sameOrder(stored, wanted)) {
    const ordered = await repo.setPhotoOrder(wanted);
    if (!ordered.ok) warnings.push({ step: "order", error: ordered.error });
  }

  // 4. New photos go after the kept ones.
  if (args.added.length > 0) {
    const attached = await attachPhotos(product.id, args.keptInOrder.length, args.added, { storage, repo, newId });
    if (attached.failure) warnings.push({ step: "upload", failure: attached.failure, saved: attached.saved.length, attempted: args.added.length });
  }

  // 5. Fresh copy with the final photo list. If this fails the form still closes with what we know.
  const fresh = await repo.getProduct(product.id);
  if (!fresh.ok) {
    warnings.push({ step: "reload", error: fresh.error });
    return { ok: true, product, created: args.productId === null, warnings };
  }
  return { ok: true, product: fresh.value, created: args.productId === null, warnings };
}
