import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, jsonLdString, productJsonLd, productMetaDescription } from "@/modules/catalog/seo";
import type { ProductDetail } from "@/modules/catalog/storefront";

const base = "https://shop.example";

function product(over: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: "1",
    slug: "mini-chopper",
    title: { en: "Mini Chopper", bn: "" },
    shortDescription: { en: "Chops onions in seconds.", bn: "" },
    labels: [],
    optionNames: ["Colour"],
    lowStockAt: 5,
    ratingAvg: 0,
    ratingCount: 0,
    media: [
      {
        id: "m1",
        type: "image",
        url: "/uploads/images/a.png",
        alt: "",
        poster: "",
        width: 0,
        height: 0,
        focalX: 50,
        focalY: 50,
        blur: "",
        youtubeId: null,
      },
    ],
    variants: [
      { id: "a", title: "Red", options: { Colour: "Red" }, price: 145_000, compareAt: 0, available: 0, mediaIds: [] },
      { id: "b", title: "Blue", options: { Colour: "Blue" }, price: 135_000, compareAt: 0, available: 3, mediaIds: [] },
    ],
    blocks: [],
    specs: [],
    seo: { title: "", description: "", ogImage: "" },
    category: { name: "Kitchen", slug: "kitchen" },
    ...over,
  };
}

describe("product SEO", () => {
  it("builds Product JSON-LD with a price range in taka and stock", () => {
    const ld = productJsonLd(product(), base);
    expect(ld).toMatchObject({
      "@type": "Product",
      name: "Mini Chopper",
      url: "https://shop.example/p/mini-chopper",
      image: ["https://shop.example/uploads/images/a.png"],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "BDT",
        lowPrice: "1350.00",
        highPrice: "1450.00",
        offerCount: 2,
        availability: "https://schema.org/InStock",
      },
    });
    expect(ld).not.toHaveProperty("aggregateRating");
  });

  it("uses a single Offer and OutOfStock when nothing can be bought", () => {
    const ld = productJsonLd(product({ variants: [{ ...product().variants[0]!, available: 0 }] }), base);
    expect(ld.offers).toMatchObject({
      "@type": "Offer",
      price: "1450.00",
      availability: "https://schema.org/OutOfStock",
    });
  });

  it("adds rating only when there are reviews", () => {
    expect(productJsonLd(product({ ratingAvg: 4.56, ratingCount: 12 }), base)).toMatchObject({
      aggregateRating: { ratingValue: "4.6", reviewCount: 12 },
    });
  });

  it("picks and trims the meta description", () => {
    expect(productMetaDescription(product())).toBe("Chops onions in seconds.");
    expect(productMetaDescription(product({ seo: { title: "", description: "Custom text", ogImage: "" } }))).toBe(
      "Custom text",
    );
    const long = "word ".repeat(60);
    const d = productMetaDescription(product({ shortDescription: { en: long, bn: "" } }));
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith("…")).toBe(true);
  });

  it("escapes < so admin text can't close the script tag", () => {
    const s = jsonLdString({ name: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)</script>");
  });

  it("numbers breadcrumb items with absolute URLs", () => {
    expect(
      breadcrumbJsonLd(
        [
          { name: "Home", path: "/" },
          { name: "Kitchen", path: "/c/kitchen" },
        ],
        base,
      ),
    ).toMatchObject({
      itemListElement: [
        { position: 1, item: "https://shop.example/" },
        { position: 2, item: "https://shop.example/c/kitchen" },
      ],
    });
  });
});
