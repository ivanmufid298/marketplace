// Public API of the catalog module for server code: product pages and the sitemap read the shop through this.
// Nothing reachable from here may import React or a "use client" file; features/architecture.test.mts enforces that.

export { getStoreProductBySlug, listStoreSitemapEntries } from "./lib/storefront-server";
export { jsonLdScript, largestPhotoUrl, metaDescription, productJsonLd } from "./lib/product-seo";
export type { SitemapEntry } from "./lib/storefront-repository";
