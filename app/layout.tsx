import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans-latin", subsets: ["latin"], display: "swap" });
// Bangla text (product names, SMS previews, invoices) falls back to Hind Siliguri.
const bangla = Hind_Siliguri({
  variable: "--font-bangla",
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
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
    <html lang="en" className={`${sans.variable} ${bangla.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
