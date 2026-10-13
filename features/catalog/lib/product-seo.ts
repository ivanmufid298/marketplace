import type { Product } from "@/lib/mock/store";

// Text and data that search engines and link previews read from a product page. No React or Next.js here.

/** The product description as one short line for a search result: whitespace collapsed, cut at a word, ending in an ellipsis. */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  // The last word is whole when the text goes on with a space right after the cut; otherwise it is dropped.
  const lastSpace = clean[max - 1] === " " ? cut.length : cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** The biggest file of a photo, taken from its `srcset` (the last entry is the widest). Falls back to `src`. */
export function largestPhotoUrl(photo: { src: string; srcSet: string }): string {
  const entry = photo.srcSet.split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).pop();
  return entry ?? photo.src;
}

/** schema.org Product data for the page, which lets search engines show price and stock in results. */
export function productJsonLd(product: Product, pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.desc ? { description: metaDescription(product.desc, 5000) } : {}),
    sku: String(product.id),
    category: product.cat,
    ...(product.photos?.length ? { image: product.photos.map(largestPhotoUrl) } : {}),
    offers: {
      "@type": "Offer",
      url: pageUrl,
      priceCurrency: "IDR",
      price: product.price,
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

/**
 * JSON for a `<script type="application/ld+json">` tag. `<` is escaped so a product description containing
 * `</script>` can never close the tag early.
 */
export const jsonLdScript = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");
