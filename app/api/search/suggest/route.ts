import { NextResponse, type NextRequest } from "next/server";
import { cleanQuery } from "@/modules/catalog/search";
import { getSuggestions } from "@/modules/catalog/search-data";

/**
 * Suggestions for the search box (FR-SF-08): up to 6 products and 4 categories.
 * GET /api/search/suggest?q=chop → { query, products: [{ slug, title, titleBn, price, image }], categories }
 * Answers come from a cached search list (no database scan), so typing stays fast.
 */
export async function GET(req: NextRequest) {
  const q = cleanQuery(req.nextUrl.searchParams.get("q") ?? "");
  const data = await getSuggestions(q);
  return NextResponse.json(data, {
    headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
