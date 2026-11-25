/**
 * Content-Security-Policy builders (NFR-SEC-11).
 *
 * - Storefront: static/ISR pages cannot carry a per-request nonce, so scripts are limited to
 *   our own origin plus Next.js inline bootstrap scripts ('unsafe-inline'). Everything else
 *   (frames, objects, base-uri, form targets, connections) is locked down.
 * - Admin: always dynamic, so it gets a strict nonce + 'strict-dynamic' policy from proxy.ts.
 */
const MEDIA_HOSTS = ["https://res.cloudinary.com"];
const GOOGLE_AVATARS = ["https://lh3.googleusercontent.com"];

/**
 * Marketing pixels (FR-AD-13): Meta, Google Analytics 4 and TikTok. They only load when their IDs are
 * saved in Admin → Integrations, but the policy is fixed at build time, so their hosts are always listed.
 */
const PIXEL_SCRIPTS = [
  "https://connect.facebook.net",
  "https://www.googletagmanager.com",
  "https://analytics.tiktok.com",
];
const PIXEL_CONNECT = [
  "https://www.facebook.com",
  "https://connect.facebook.net",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://www.googletagmanager.com",
  "https://analytics.tiktok.com",
  "https://*.tiktok.com",
  "https://*.tiktokw.us",
];
/** Error reports from the browser (Sentry, NFR-AV-03). */
const ERROR_REPORTS = ["https://*.sentry.io"];
const PIXEL_IMAGES = [
  "https://www.facebook.com",
  "https://*.google-analytics.com",
  "https://www.googletagmanager.com",
  "https://analytics.tiktok.com",
];

function join(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(" ")}` : k))
    .join("; ");
}

/** `framedBySelf`: the builder's draft preview, shown in a frame inside the admin. */
export function storefrontCsp(isDev: boolean, https = !isDev, framedBySelf = false): string {
  return join({
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...PIXEL_SCRIPTS, ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...MEDIA_HOSTS, ...GOOGLE_AVATARS, ...PIXEL_IMAGES],
    "media-src": ["'self'", "blob:", ...MEDIA_HOSTS],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...PIXEL_CONNECT, ...ERROR_REPORTS, ...(isDev ? ["ws:"] : [])],
    "frame-src": ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": [framedBySelf ? "'self'" : "'none'"],
    ...(https ? { "upgrade-insecure-requests": [] } : {}),
  });
}

export function adminCsp(nonce: string, isDev: boolean, https = !isDev): string {
  return join({
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes from UI libraries are low risk; scripts are what the nonce protects.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...MEDIA_HOSTS, ...GOOGLE_AVATARS],
    "media-src": ["'self'", "blob:", ...MEDIA_HOSTS],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "https://api.cloudinary.com", ...ERROR_REPORTS, ...(isDev ? ["ws:"] : [])],
    "frame-src": ["'self'"], // the storefront builder's draft preview
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(https ? { "upgrade-insecure-requests": [] } : {}),
  });
}

export const BASE_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

export const HSTS = { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" };
