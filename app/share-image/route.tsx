import { ImageResponse } from "next/og";
import { env } from "@/lib/env";
import { getLiveDesign } from "@/modules/storefront/design-data";

/**
 * The picture shown when a page without its own image is shared (Open Graph, NFR-UX-01): the store's
 * name on its brand colour. Pages with a product or category picture share that instead.
 */
export async function GET() {
  const { theme, navigation } = await getLiveDesign();
  const name = env().STORE_NAME;
  const tagline =
    navigation.footer.about.split(/(?<=[.!?])\s/)[0]?.slice(0, 110) ||
    "Kitchen, home and lifestyle gadgets, delivered across Bangladesh";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: theme.brand,
        color: "#ffffff",
      }}
    >
      <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
      <div style={{ marginTop: 28, fontSize: 38, opacity: 0.92, lineHeight: 1.3 }}>{tagline}</div>
      <div style={{ marginTop: 56, fontSize: 30, opacity: 0.85 }}>Cash on delivery</div>
    </div>,
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
