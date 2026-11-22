import type { Metadata } from "next";
import { Tracker } from "@/components/store/analytics/tracker";
import { StoreShell } from "@/components/store/shell/store-shell";
import { getTrackingIds } from "@/modules/analytics/data";
import { trackingOn } from "@/modules/analytics/events";
import { getLiveDesign } from "@/modules/storefront/design-data";

/** Favicon from the theme (FR-SF-03); everything else comes from the root layout. */
export async function generateMetadata(): Promise<Metadata> {
  const { theme } = await getLiveDesign();
  return theme.favicon.url ? { icons: { icon: theme.favicon.url } } : {};
}

/**
 * Storefront frame with the published menus, footer, announcement bar and theme (FR-SF-02, 03), and
 * the marketing pixels when they are set up (FR-AD-13). Draft previews use the frame without them.
 */
export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const [design, tracking] = await Promise.all([getLiveDesign(), getTrackingIds()]);
  return (
    <StoreShell design={design}>
      {trackingOn(tracking) && <Tracker ids={tracking} />}
      {children}
    </StoreShell>
  );
}
