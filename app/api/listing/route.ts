import { NextResponse, type NextRequest } from "next/server";
import { parseListingParams } from "@/modules/catalog/listing";
import { getListing, type ListingSource } from "@/modules/catalog/listing-data";
import { SLUG_RE } from "@/modules/catalog/logic";

/**
 * "Load more" for category and collection pages in infinite-scroll mode (FR-SF-07).
 * GET /api/listing?src=category:kitchen&colour=red&cursor=…  → { products, nextCursor }
 * Public card data only; the list itself is cached on the server and refreshed by admin saves.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [kind, slug = ""] = (sp.get("src") ?? "").split(":");
  const cursor = sp.get("cursor") ?? "";
  if ((kind !== "category" && kind !== "collection") || slug.length > 120 || !SLUG_RE.test(slug) || !cursor) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const source: ListingSource = { kind, slug };
  const res = await getListing(source, { ...parseListingParams(sp), page: 1 }, cursor);
  return NextResponse.json(
    { products: res.products, nextCursor: res.nextCursor },
    { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" } },
  );
}
