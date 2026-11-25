/**
 * Helpers for stored media URLs (Cloudinary, or /uploads/... in development). Safe on client and server.
 * Cloudinary can transform on the fly by adding parameters after "/upload/", which gives us tiny blur
 * placeholders and video posters without storing extra files.
 */

const CLOUDINARY_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//;

export function isCloudinary(url: string): boolean {
  return CLOUDINARY_RE.test(url);
}

/** Adds a Cloudinary transformation (e.g. "w_24,e_blur:300") to a delivery URL; other URLs are returned unchanged. */
export function cloudinaryTransform(url: string, transform: string): string {
  const m = CLOUDINARY_RE.exec(url);
  if (!m) return url;
  return url.slice(0, m[0].length) + transform + "/" + url.slice(m[0].length);
}

/** First frame of a Cloudinary video as a JPG, used as the poster. Empty for other sources. */
export function videoPosterUrl(url: string): string {
  const m = CLOUDINARY_RE.exec(url);
  if (!m || m[1] !== "video") return "";
  return cloudinaryTransform(url, "so_0,f_jpg").replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
}

/**
 * A ~24px blurred version shown while the real image loads (FR-PC-07). Only for Cloudinary;
 * local development uploads get a plain tinted background instead.
 */
export function blurPlaceholderUrl(url: string): string {
  if (!isCloudinary(url)) return "";
  const still = url.includes("/video/upload/") ? videoPosterUrl(url) : url;
  return cloudinaryTransform(still, "w_24,q_30,e_blur:400,f_auto");
}
