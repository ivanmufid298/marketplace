import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// The shop is for everyone to find. The admin, and the pages that only make sense after an email link, are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/akun", "/reset-password", "/lupa-sandi"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
