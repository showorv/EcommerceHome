"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether the element is on screen, so slideshows and other timed motion can pause while it isn't
 * (NFR-PF-03). Starts as true so nothing waits for the first check.
 */
export function useOnScreen(ref: RefObject<Element | null>, rootMargin = "0px"): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry!.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return onScreen;
}
