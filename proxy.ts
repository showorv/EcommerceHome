import { NextResponse, type NextRequest } from "next/server";
import { adminCsp } from "./lib/security-headers";
import { isPublicAdminPath, requiredPermission } from "./modules/auth/admin-routes";
import { auth } from "./modules/auth/auth";
import { can, isStaff } from "./modules/auth/rbac";

/**
 * Runs before every /admin request (Node.js runtime):
 * 1. Access gate — signed in, staff role, not blocked, and the section's permission.
 *    A missing permission returns a real HTTP 403 before anything renders (NFR-SEC-07).
 *    Pages, server actions and route handlers still check again on their own.
 * 2. Strict per-request nonce Content-Security-Policy (NFR-SEC-11).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isPublicAdminPath(pathname)) {
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user;
    if (!user) return redirect(request, "/admin/sign-in");
    if (!isStaff(user)) return redirect(request, "/admin/sign-in", "not_staff");
    if (user.status === "blocked") return redirect(request, "/admin/sign-in", "blocked");
    const permission = requiredPermission(pathname);
    if (permission && !can(user, permission)) {
      return withSecurityHeaders(
        request,
        () =>
          new NextResponse(FORBIDDEN_HTML, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } }),
      );
    }
  }

  return withSecurityHeaders(request, (headers) => NextResponse.next({ request: { headers } }));
}

/** Plain page for HTTP 403: Next.js proxy can only set a status on a response it builds itself. */
const FORBIDDEN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>403 · No access</title><meta name="robots" content="noindex"></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f6f3;color:#1d1f24">
<main style="text-align:center;padding:16px"><p style="font-family:monospace;color:#6b6f78">403</p><h1 style="font-size:1.5rem">You don't have access to this page</h1>
<p style="color:#6b6f78">Ask an owner if you need this permission.</p><p><a href="/admin" style="color:inherit">Back to dashboard</a></p></main></body></html>`;

function redirect(request: NextRequest, path: string, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = error ? `?error=${error}` : "";
  return NextResponse.redirect(url);
}

function withSecurityHeaders(request: NextRequest, make: (headers: Headers) => NextResponse) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = adminCsp(
    nonce,
    process.env.NODE_ENV !== "production",
    (process.env.APP_URL ?? "").startsWith("https://"),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = make(requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/admin/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
