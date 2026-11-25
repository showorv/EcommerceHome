import type { NextConfig } from "next";
import { BASE_SECURITY_HEADERS, HSTS, storefrontCsp } from "./lib/security-headers";

const isDev = process.env.NODE_ENV !== "production";
// Only ask browsers to upgrade to HTTPS when the site is actually served over HTTPS.
const isHttps = (process.env.APP_URL ?? "").startsWith("https://");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    authInterrupts: true, // enables forbidden() → real 403 UI for missing permissions
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  serverExternalPackages: ["@node-rs/argon2", "pino"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const base = [...BASE_SECURITY_HEADERS, ...(isHttps ? [HSTS] : [])];
    return [
      { source: "/:path*", headers: base },
      // Admin gets its own nonce-based CSP from proxy.ts.
      { source: "/((?!admin).*)", headers: [{ key: "Content-Security-Policy", value: storefrontCsp(isDev, isHttps) }] },
      // The storefront builder shows the draft preview in a frame on our own admin pages.
      {
        source: "/preview/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: storefrontCsp(isDev, isHttps, true) },
        ],
      },
    ];
  },
};

export default nextConfig;
