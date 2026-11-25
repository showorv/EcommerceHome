/** Media URL rules shared by catalogue and storefront validation. Pure, safe in the browser. */

/**
 * Files we can actually show: Cloudinary, or our own development uploads under /uploads/.
 * The storefront's Content-Security-Policy blocks images from any other site.
 */
export function isStoredMediaUrl(u: string): boolean {
  return /^\/uploads\/(images|videos)\/[\w.-]+$/.test(u) || /^https:\/\/res\.cloudinary\.com\/[^\s]+$/.test(u);
}

export function youtubeId(url: string): string | null {
  const m = url.match(/^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}
