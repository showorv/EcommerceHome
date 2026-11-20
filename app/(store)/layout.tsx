import type { Metadata } from "next";
import { StoreShell } from "@/components/store/shell/store-shell";
import { getLiveDesign } from "@/modules/storefront/design-data";

/** Favicon from the theme (FR-SF-03); everything else comes from the root layout. */
export async function generateMetadata(): Promise<Metadata> {
  const { theme } = await getLiveDesign();
  return theme.favicon.url ? { icons: { icon: theme.favicon.url } } : {};
}

/** Storefront frame with the published menus, footer, announcement bar and theme (FR-SF-02, 03). */
export default async function StoreLayout({ children }: LayoutProps<"/">) {
  return <StoreShell design={await getLiveDesign()}>{children}</StoreShell>;
}
