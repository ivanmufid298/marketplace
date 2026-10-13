// Public API of the catalog module: what the storefront shows and how a shopper narrows it down.

export { CatalogProvider, useCatalog } from "./catalog-provider";
export { ALL_CATEGORIES, filterProducts, type CatalogFilter } from "./lib/filter-products";
export type { Product, SortMode } from "@/lib/mock/store";

// Product photos: sizes, keys, and the in-browser resize used by the admin product form.
export {
  allVariantKeys, buildSrcSet, checkSourceFile, isTooSmallForBestQuality, newPhotoKey, photoKeyBelongsTo, planVariants, publicObjectUrl,
  variantKey, VARIANT_WIDTHS, MAX_SOURCE_BYTES, ACCEPTED_SOURCE_TYPES, RECOMMENDED_MIN_WIDTH,
  type PhotoExtension, type PlannedVariant, type SourceFileProblem, type VariantWidth,
} from "./lib/image-variants";
export { resizePhoto, ResizeFailure, type ResizedPhoto, type ResizedVariant, type ResizeError } from "./lib/resize-image";
