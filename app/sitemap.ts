import type { MetadataRoute } from "next";
import { listStoreSitemapEntries } from "@/features/catalog/server";
import { siteUrl } from "@/lib/site-url";

// Listed fresh on every request: products come and go as the admin switches them on and off.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const products = await listStoreSitemapEntries();
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...products.map((p) => ({ url: `${base}/produk/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
