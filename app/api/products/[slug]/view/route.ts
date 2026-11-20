import { NextResponse, type NextRequest } from "next/server";
import { SLUG_RE } from "@/modules/catalog/logic";
import { getProductView } from "@/modules/catalog/storefront";

/**
 * Public product data for the quick-view popup (FR-PC-04). Active products only, no cost data.
 * The data itself is cached on the server and refreshed when the product is saved in the admin;
 * browsers may reuse a response for 30 seconds.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/products/[slug]/view">) {
  const { slug } = await ctx.params;
  if (slug.length > 120 || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const product = await getProductView(slug);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product, {
    headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" },
  });
}
