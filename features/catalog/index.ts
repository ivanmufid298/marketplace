// Public API of the catalog module: what the storefront shows and how a shopper narrows it down.

export { CatalogProvider, useCatalog, type CatalogStatus } from "./catalog-provider";
export { ALL_CATEGORIES, filterProducts, type CatalogFilter } from "./lib/filter-products";
export type { Product, SortMode } from "@/lib/mock/store";

// Product photos: sizes, keys, and the in-browser resize used by the admin product form.
export {
  allVariantKeys, buildSrcSet, checkSourceFile, isTooSmallForBestQuality, newPhotoKey, photoKeyBelongsTo, planVariants, publicObjectUrl,
  variantKey, VARIANT_WIDTHS, MAX_SOURCE_BYTES, ACCEPTED_SOURCE_TYPES, RECOMMENDED_MIN_WIDTH,
  type PhotoExtension, type PlannedVariant, type SourceFileProblem, type VariantWidth,
} from "./lib/image-variants";
export { resizePhoto, ResizeFailure, type ResizedPhoto, type ResizedVariant, type ResizeError } from "./lib/resize-image";

// Product data for the admin screens: validation, the repository, error mapping, and saving photos.
export { createProductRepository, type AdminProduct, type Category, type ProductPhoto, type ProductRepository, type Result as CatalogResult } from "./lib/product-repository";
export { mapDbError, type SaveError, type SaveErrorKind } from "./lib/db-errors";
export {
  EMPTY_PRODUCT_FORM, LIMITS, parseProduct, parseWholeNumber, PRODUCT_STATUSES, slugify, toFormValues,
  type ProductFieldError, type ProductFormErrors, type ProductFormValues, type ProductInput, type ProductStatus,
} from "./lib/product-form";
export { createSupabasePhotoStorage, PHOTO_BUCKET, PhotoStorageError, type PhotoStorage } from "./lib/photo-storage";
export { attachPhotos, removePhotoFully, type AttachOutcome, type PhotoDraft } from "./lib/save-photos";

// The admin product screen (list, form, photos). Mounted by app/admin/(panel)/products.
export { AdminProductsView } from "./components/admin/admin-products-view";
