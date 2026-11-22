"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ShopEvent, TrackingIds } from "@/modules/analytics/events";
import { startPixels, track, trackPageView } from "./pixels";

/** In the store layout: starts the pixels once the page is interactive and counts each page view. */
export function Tracker({ ids }: { ids: TrackingIds }) {
  const pathname = usePathname();
  useEffect(() => {
    startPixels(ids);
  }, [ids]);
  useEffect(() => {
    trackPageView();
  }, [pathname]);
  return null;
}

/**
 * Sends one event when it shows (a product viewed, an order placed). `once` keeps a purchase from being
 * counted again when the thank-you page is reloaded in the same tab.
 */
export function TrackEvent({ event, once }: { event: ShopEvent; once?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (once) {
      try {
        if (sessionStorage.getItem(`tracked:${once}`)) return;
        sessionStorage.setItem(`tracked:${once}`, "1");
      } catch {
        // Private mode without storage: the shared event id still stops double counting.
      }
    }
    // After the pixels have started (the layout's effect runs first on a full load).
    setTimeout(() => track(event), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one event per page show
  }, []);
  return null;
}
