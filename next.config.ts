import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Copied into the build so lib/auth/config.ts can tell a Vercel Preview from everything else. It is empty on any
  // other host, which keeps demo mode off there. This does not rely on Vercel's "expose system environment
  // variables" dashboard setting.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
};

export default nextConfig;
