"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MenuItem } from "@/modules/storefront/design";

/** Header menu on phones: a panel from the left with collapsible groups (FR-SF-02). */
export function MobileMenu({ items, storeName }: { items: MenuItem[]; storeName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent -ml-2 grid size-10 place-items-center rounded-full md:hidden"
          aria-label="Menu"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 grid h-dvh w-[85vw] max-w-sm translate-x-0 translate-y-0 grid-rows-[auto_1fr] gap-0 overflow-hidden rounded-none p-0 sm:max-w-sm"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <DialogTitle className="text-base">{storeName}</DialogTitle>
          <DialogDescription className="sr-only">Store menu</DialogDescription>
          <DialogClose className="hover:bg-accent grid size-9 place-items-center rounded-full" aria-label="Close menu">
            <X className="size-5" aria-hidden />
          </DialogClose>
        </div>
        <nav aria-label="Main" className="overflow-y-auto p-2">
          <ul className="grid gap-0.5">
            {items.map((item) =>
              item.children.length ? (
                <li key={item.id}>
                  <details className="group">
                    <summary className="hover:bg-accent flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-3 font-medium [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2">
                        {item.label}
                        {item.badge && (
                          <span className="bg-brand text-brand-foreground rounded-full px-1.5 py-px text-[10px] font-bold uppercase">
                            {item.badge}
                          </span>
                        )}
                      </span>
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <ul className="mb-2 ml-3 grid gap-0.5 border-l pl-2">
                      {item.href && (
                        <li>
                          <Link
                            href={item.href}
                            className="text-brand block rounded-lg px-3 py-2 text-sm font-semibold"
                          >
                            All {item.label.toLowerCase()}
                          </Link>
                        </li>
                      )}
                      {item.children.map((col) => (
                        <li key={col.id}>
                          {col.href ? (
                            <Link
                              href={col.href}
                              className="hover:bg-accent block rounded-lg px-3 py-2 text-sm font-medium"
                            >
                              {col.label}
                            </Link>
                          ) : (
                            <p className="text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold uppercase">
                              {col.label}
                            </p>
                          )}
                          {col.children.length > 0 && (
                            <ul className="grid gap-0.5 pl-3">
                              {col.children.map((l) => (
                                <li key={l.id}>
                                  <Link
                                    href={l.href || "/"}
                                    className="text-muted-foreground hover:bg-accent block rounded-lg px-3 py-1.5 text-sm"
                                  >
                                    {l.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ) : (
                <li key={item.id}>
                  <Link
                    href={item.href || "/"}
                    className="hover:bg-accent flex items-center gap-2 rounded-lg px-3 py-3 font-medium"
                  >
                    {item.label}
                    {item.badge && (
                      <span className="bg-brand text-brand-foreground rounded-full px-1.5 py-px text-[10px] font-bold uppercase">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ),
            )}
            <li className="mt-2 border-t pt-2">
              <Link href="/account" className="hover:bg-accent block rounded-lg px-3 py-3 font-medium">
                My account
              </Link>
            </li>
            <li>
              <Link href="/account/wishlist" className="hover:bg-accent block rounded-lg px-3 py-3 font-medium">
                Wishlist
              </Link>
            </li>
            <li>
              <Link href="/track" className="hover:bg-accent block rounded-lg px-3 py-3 font-medium">
                Track order
              </Link>
            </li>
          </ul>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
