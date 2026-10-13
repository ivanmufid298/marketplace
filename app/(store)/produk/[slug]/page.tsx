import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductPage } from "@/components/organisms/store/product-page";
import { getStoreProductBySlug, jsonLdScript, largestPhotoUrl, metaDescription, productJsonLd } from "@/features/catalog/server";
import { t } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";

// Rendered on every request, so a product that was just switched off, repriced, or sold out is never served stale.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

// The page and its metadata both need the product; this makes it one database read per request.
const loadProduct = cache(getStoreProductBySlug);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: t("store.productPage.notFoundTitle"), robots: { index: false } };

  const title = t("store.productPage.metaTitle", { name: product.name });
  const description = metaDescription(product.desc) || t("store.meta.description");
  const cover = product.photos?.[0];
  return {
    title,
    description,
    alternates: { canonical: `/produk/${slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/produk/${slug}`,
      ...(cover ? { images: [{ url: largestPhotoUrl(cover), width: cover.width ?? undefined, height: cover.height ?? undefined, alt: cover.alt || product.name }] } : {}),
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ProductRoute({ params }: Params) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(product, `${siteUrl()}/produk/${slug}`)) }} />
      <ProductPage product={product} />
    </>
  );
}
