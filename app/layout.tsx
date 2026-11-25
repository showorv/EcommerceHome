import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { FONT_VARIABLES } from "@/lib/fonts";
import { searchIndexing, shareMeta } from "@/modules/seo/site";
import "./globals.css";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const STORE_NAME = process.env.STORE_NAME ?? "Store";
const DESCRIPTION = "Kitchen, home and lifestyle gadgets imported from China, delivered across Bangladesh.";

export const metadata: Metadata = {
  // Makes relative image/page URLs absolute in share previews (Open Graph) and canonical links.
  metadataBase: new URL(APP_URL),
  title: { default: STORE_NAME, template: `%s · ${STORE_NAME}` },
  description: DESCRIPTION,
  // Staging and local copies stay out of search engines (see robots.ts).
  ...(searchIndexing(process.env.SEARCH_INDEXING, APP_URL) ? {} : { robots: { index: false, follow: false } }),
  ...shareMeta({ siteName: STORE_NAME, title: STORE_NAME, description: DESCRIPTION }),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${FONT_VARIABLES} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
