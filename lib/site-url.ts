/**
 * The public address of the site, with no trailing slash, for absolute links in the sitemap, link previews, and
 * structured data. `NEXT_PUBLIC_SITE_URL` is the one to set once the real domain is known. Until then a Vercel
 * build falls back to the production address Vercel gives it (copied in by next.config.ts), and anything else falls
 * back to localhost. If the sitemap ever lists localhost on a live site, this is what to set.
 */
export function siteUrl(env: { site?: string; vercelProduction?: string } = { site: process.env.NEXT_PUBLIC_SITE_URL, vercelProduction: process.env.NEXT_PUBLIC_VERCEL_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL }): string {
  const site = env.site?.trim();
  if (site) return site.replace(/\/+$/, "");
  const vercel = env.vercelProduction?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
