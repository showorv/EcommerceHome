import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal for sections and product cards (FR-SF-04), done in CSS (app/globals.css, "Scroll
 * motion"): no JavaScript, runs off the main thread, only animates opacity and transform, and does
 * nothing off-screen (NFR-PF-02/03). Content is never hidden before scripts load, so the largest
 * picture is not delayed (NFR-PF-01). Browsers without scroll-driven animations show it straight away,
 * and so do the "off" motion level and shoppers who prefer less motion.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("reveal", className)}>{children}</div>;
}

/** A grid whose items reveal one after another as they scroll in. Wrap items in <StaggerItem>. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

/** Style for the index-th item of a row: a slightly later start (columns repeat every 4). */
export const staggerStyle = (index: number) => ({ "--reveal-i": index % 4 }) as CSSProperties;

/** `index` gives each card in a row a slightly later start (columns repeat every 4). */
export function StaggerItem({
  children,
  className,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <div className={cn("reveal", className)} style={staggerStyle(index)}>
      {children}
    </div>
  );
}
