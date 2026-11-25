/**
 * CSRF check for cookie-authenticated route handlers (NFR-SEC-12). Server actions already get Next.js's
 * origin check and Better Auth checks its own routes; custom POST routes call this first.
 *
 * Browsers send `Sec-Fetch-Site` on every request and `Origin` on every POST, and a page can't fake
 * either. A request is accepted only when the browser says it came from our own site. Requests with
 * neither header (old browsers, scripts) are refused: these routes are only ever called by our pages.
 */
export function isSameOriginRequest(headers: Headers, appUrl: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
