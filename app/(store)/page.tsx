import { Sections } from "@/components/storefront-sections/sections";
import { getLiveSections } from "@/modules/storefront/pages";

/**
 * Home page, built from sections in the admin storefront builder (FR-SF-01, FR-AD-07). Before the
 * first publish it shows a built-in starter layout.
 */
export default async function HomePage() {
  const sections = await getLiveSections("home");
  return <Sections sections={sections} />;
}
