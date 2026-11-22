import type { Metadata } from "next";
import { Sections } from "@/components/storefront-sections/sections";
import { env } from "@/lib/env";
import { jsonLdString } from "@/modules/catalog/seo";
import { organizationJsonLd, shareMeta, websiteJsonLd } from "@/modules/seo/site";
import { getLiveDesign } from "@/modules/storefront/design-data";
import { getLiveSections } from "@/modules/storefront/pages";

const DESCRIPTION = "Kitchen, home and lifestyle gadgets imported from China, delivered across Bangladesh.";

export async function generateMetadata(): Promise<Metadata> {
  const { STORE_NAME } = env();
  const { navigation } = await getLiveDesign();
  const description = navigation.footer.about.trim().slice(0, 160) || DESCRIPTION;
  return {
    description,
    alternates: { canonical: "/" },
    ...shareMeta({ siteName: STORE_NAME, title: STORE_NAME, description, path: "/" }),
  };
}

/**
 * Home page, built from sections in the admin storefront builder (FR-SF-01, FR-AD-07). Before the
 * first publish it shows a built-in starter layout. Carries the shop's Organization and WebSite
 * structured data (NFR-UX-01).
 */
export default async function HomePage() {
  const [sections, design] = await Promise.all([getLiveSections("home"), getLiveDesign()]);
  const { APP_URL, STORE_NAME } = env();
  const footer = design.navigation.footer;
  const org = organizationJsonLd({
    name: STORE_NAME,
    base: APP_URL,
    logo: design.theme.logo.url || null,
    phone: footer.phone,
    email: footer.email,
    sameAs: footer.social.map((s) => s.url).filter((u) => /^https?:\/\//.test(u)),
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(org) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(websiteJsonLd(STORE_NAME, APP_URL)) }}
      />
      <Sections sections={sections} />
    </>
  );
}
