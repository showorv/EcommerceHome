import Link from "next/link";
import { Suspense } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { HeaderSearch, HeaderSearchFallback } from "@/components/store/header-search";
import { QuickViewHost } from "@/components/store/quick-view";

/**
 * Storefront shell. Header, menus and footer become admin-editable in Phase 1 (FR-SF-02);
 * the motion level will come from theme settings.
 */
export default function StoreLayout({ children }: LayoutProps<"/">) {
  const name = process.env.STORE_NAME ?? "Store";
  return (
    <MotionProvider level="full">
      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
            {name}
          </Link>
          <div className="flex flex-1 items-center justify-end gap-2 md:justify-center">
            {/* Reads the address (?q= on the results page), so it renders in the browser. */}
            <Suspense fallback={<HeaderSearchFallback />}>
              <HeaderSearch />
            </Suspense>
          </div>
          <nav className="flex shrink-0 items-center gap-4 text-sm">
            <Link href="/account" className="text-muted-foreground hover:text-foreground">
              Account
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-muted-foreground border-t py-8 text-center text-sm">© {name}</footer>
      {/* Reads ?product= from the URL, so it renders in the browser only (the page itself stays static). */}
      <Suspense fallback={null}>
        <QuickViewHost />
      </Suspense>
    </MotionProvider>
  );
}
