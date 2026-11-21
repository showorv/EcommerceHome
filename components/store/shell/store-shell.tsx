import { Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { CartButton, CartDrawer } from "@/components/store/cart/cart-drawer";
import { HeaderSearch, HeaderSearchFallback } from "@/components/store/header-search";
import { QuickViewHost } from "@/components/store/quick-view";
import { getCategoryTree } from "@/modules/catalog/category-tree";
import { chatLive, SOCIAL_NAMES, themeCss, type Design, type MenuItem } from "@/modules/storefront/design";
import { AnnouncementBar } from "./announcement-bar";
import { ChatButton } from "./chat-button";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";
import { SocialIcon } from "./social-icons";

/**
 * Store frame: theme, announcement bar, header with menus, footer, chat button (FR-SF-02/03/04/10).
 * Used by the store layout with the published design, and by the draft preview with the draft.
 */
export async function StoreShell({
  design,
  banner,
  children,
}: {
  /** With the announcement bar already switched off outside its dates (see design-data.ts). */
  design: Design;
  /** Shown above everything (the draft preview's notice). */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const name = process.env.STORE_NAME ?? "Store";
  const { navigation: nav, theme } = design;
  const items = nav.header.length ? nav.header : await categoryMenu();
  const showAnnouncement = nav.announcement.enabled && nav.announcement.messages.length > 0;

  return (
    <MotionProvider level={theme.motion}>
      {/* Values come from the validated theme only (hex colours and fixed lists). */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      {/* data-motion switches the CSS scroll motion and page transitions (globals.css, "Scroll motion"). */}
      <div data-motion={theme.motion} className="contents">
        {banner}
        {showAnnouncement && <AnnouncementBar announcement={nav.announcement} />}
        <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
          <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16">
            <div className="flex shrink-0 items-center gap-1">
              <MobileMenu items={items} storeName={name} />
              <Link href="/" className="flex items-center text-lg font-bold tracking-tight" aria-label={`${name} home`}>
                {theme.logo.url ? (
                  <Image
                    src={theme.logo.url}
                    alt={theme.logo.alt || name}
                    width={theme.logoHeight * 5}
                    height={theme.logoHeight}
                    style={{ height: theme.logoHeight, width: "auto" }}
                    className="max-w-[45vw] object-contain"
                    loading="eager"
                  />
                ) : (
                  name
                )}
              </Link>
            </div>
            <div className="flex flex-1 items-center justify-end gap-2 md:justify-center">
              {/* Reads the address (?q= on the results page), so it renders in the browser. */}
              <Suspense fallback={<HeaderSearchFallback />}>
                <HeaderSearch />
              </Suspense>
            </div>
            <nav className="flex shrink-0 items-center gap-4 text-sm" aria-label="Account">
              <Link href="/account" className="text-muted-foreground hover:text-foreground hidden sm:inline">
                Account
              </Link>
              <CartButton />
            </nav>
          </div>
          {items.length > 0 && (
            <nav aria-label="Main" className="hidden border-t md:block">
              <div className="relative mx-auto max-w-6xl px-3 py-1">
                <DesktopNav items={items} />
              </div>
            </nav>
          )}
        </header>
        <main className="flex-1">{children}</main>
        <Footer design={design} name={name} />
        {chatLive(design.chat) && <ChatButton chat={design.chat} />}
        {/* Reads ?product= from the URL, so it renders in the browser only (the page itself stays static). */}
        <Suspense fallback={null}>
          <QuickViewHost />
        </Suspense>
        <CartDrawer />
      </div>
    </MotionProvider>
  );
}

/** Until a menu is set up, the header lists the visible top-level categories. */
async function categoryMenu(): Promise<MenuItem[]> {
  const tree = await getCategoryTree();
  return tree
    .filter((c) => c.active && c.parentId === null)
    .slice(0, 8)
    .map((c) => ({
      id: `cat-${c.id}`.slice(0, 24),
      label: c.name.en,
      href: `/c/${c.slug}`,
      badge: "",
      children: [],
      image: { url: "", alt: "" },
    }));
}

function Footer({ design, name }: { design: Design; name: string }) {
  const f = design.navigation.footer;
  const hasContact = Boolean(f.phone || f.email || f.address);
  const hasTop = Boolean(f.about || f.columns.length || hasContact || f.social.length);
  return (
    <footer className="bg-muted/40 mt-10 border-t">
      {hasTop && (
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          {(f.about || f.social.length > 0) && (
            <div className="grid content-start gap-4">
              <p className="text-lg font-bold tracking-tight">{name}</p>
              {f.about && (
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{f.about}</p>
              )}
              {f.social.length > 0 && (
                <ul className="flex gap-2">
                  {f.social.map((s) => (
                    <li key={s.network}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={SOCIAL_NAMES[s.network]}
                        className="bg-background hover:text-brand grid size-10 place-items-center rounded-full border transition-colors"
                      >
                        <SocialIcon network={s.network} className="size-5" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {f.columns.map((col) => (
            <div key={col.id} className="grid content-start gap-3">
              {col.heading && <p className="text-sm font-semibold">{col.heading}</p>}
              <ul className="grid gap-2">
                {col.links.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href || "/"} className="text-muted-foreground hover:text-foreground text-sm">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {hasContact && (
            <div className="grid content-start gap-3">
              <p className="text-sm font-semibold">Contact</p>
              <ul className="text-muted-foreground grid gap-2 text-sm">
                {f.phone && (
                  <li>
                    <a
                      href={`tel:${f.phone.replace(/[^\d+]/g, "")}`}
                      className="hover:text-foreground flex items-center gap-2"
                    >
                      <Phone className="size-4 shrink-0" aria-hidden /> {f.phone}
                    </a>
                  </li>
                )}
                {f.email && (
                  <li>
                    <a href={`mailto:${f.email}`} className="hover:text-foreground flex items-center gap-2 break-all">
                      <Mail className="size-4 shrink-0" aria-hidden /> {f.email}
                    </a>
                  </li>
                )}
                {f.address && (
                  <li className="flex items-start gap-2 whitespace-pre-line">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {f.address}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="text-muted-foreground border-t py-6 text-center text-sm">
        © {name}
        {f.bottomText && <span> · {f.bottomText}</span>}
      </div>
    </footer>
  );
}
