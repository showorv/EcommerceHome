import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * The admin area is never prerendered or cached publicly (SRS §6.1). Rendering every
 * request on the server also lets Next.js apply the per-request CSP nonce from proxy.ts.
 */
export const instant = false;

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  return <div className="bg-muted/30 flex min-h-full flex-1 flex-col">{children}</div>;
}
