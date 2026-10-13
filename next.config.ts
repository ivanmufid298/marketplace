import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copied into the build so features/auth/lib/config.ts can tell a Vercel Preview from everything else. It is empty on any
  // other host, which keeps demo mode off there. This does not rely on Vercel's "expose system environment
  // variables" dashboard setting.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
    // Same idea: the production address on Vercel, so the sitemap and canonical links name the right domain without
    // anyone having to set NEXT_PUBLIC_SITE_URL first. Empty on any other host.
    NEXT_PUBLIC_VERCEL_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "",
  },
};

export default nextConfig;
