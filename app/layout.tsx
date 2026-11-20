import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { FONT_VARIABLES } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Makes relative image/page URLs absolute in share previews (Open Graph) and canonical links.
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: process.env.STORE_NAME ?? "Store", template: `%s · ${process.env.STORE_NAME ?? "Store"}` },
  description: "Kitchen, home and lifestyle gadgets imported from China, delivered across Bangladesh.",
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
