"use client";

import {
  ga4Event,
  metaEvent,
  tiktokEvent,
  trackingOn,
  type ShopEvent,
  type TrackingIds,
} from "@/modules/analytics/events";

/**
 * Loads the marketing pixels in the browser and sends shop events to them (FR-AD-13). Nothing loads
 * until the store has IDs saved in Admin → Integrations, and only after the page is interactive.
 * Events sent before the scripts arrive wait in each pixel's own queue.
 */

type Fn = ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void };
type Win = Window & {
  fbq?: Fn & { push?: Fn; loaded?: boolean; version?: string };
  _fbq?: unknown;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  ttq?: { [k: string]: unknown } & unknown[];
  TiktokAnalyticsObject?: string;
};

let ids: TrackingIds | null = null;

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function startMeta(pixelId: string) {
  const w = window as Win;
  if (!w.fbq) {
    const fbq: Fn = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    };
    Object.assign(fbq, { push: fbq, loaded: true, version: "2.0", queue: [] });
    w.fbq = fbq;
    w._fbq = fbq;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
  }
  w.fbq!("init", pixelId);
}

function startGa4(measurementId: string) {
  const w = window as Win;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag() {
    // gtag.js reads the arguments object itself.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`);
  w.gtag("js", new Date());
  // Page views are sent by us on every page change (the store moves between pages without reloading).
  w.gtag("config", measurementId, { send_page_view: false });
}

function startTiktok(pixelId: string) {
  const w = window as Win;
  w.TiktokAnalyticsObject = "ttq";
  const ttq = (w.ttq = w.ttq ?? ([] as unknown as NonNullable<Win["ttq"]>));
  const methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
    "holdConsent",
    "revokeConsent",
    "grantConsent",
  ];
  for (const m of methods) {
    ttq[m] = (...args: unknown[]) => {
      (ttq as unknown[]).push([m, ...args]);
    };
  }
  addScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`);
}

/** Starts the pixels that have an ID. Safe to call more than once. */
export function startPixels(next: TrackingIds) {
  if (ids || !trackingOn(next)) return;
  ids = next;
  if (next.metaPixelId) startMeta(next.metaPixelId);
  if (next.ga4Id) startGa4(next.ga4Id);
  if (next.tiktokPixelId) startTiktok(next.tiktokPixelId);
}

export function trackPageView() {
  if (!ids) return;
  const w = window as Win;
  if (ids.metaPixelId) w.fbq?.("track", "PageView");
  if (ids.ga4Id) w.gtag?.("event", "page_view", { page_location: location.href, page_title: document.title });
  if (ids.tiktokPixelId) (w.ttq?.page as (() => void) | undefined)?.();
}

/** Sends one shop event to every pixel that is on. Never throws: tracking must not break shopping. */
export function track(e: ShopEvent) {
  if (!ids) return;
  try {
    const w = window as Win;
    if (ids.metaPixelId) {
      const m = metaEvent(e);
      w.fbq?.("track", m.name, m.data, m.eventId ? { eventID: m.eventId } : undefined);
    }
    if (ids.ga4Id) {
      const g = ga4Event(e);
      w.gtag?.("event", g.name, g.params);
    }
    if (ids.tiktokPixelId) {
      const t = tiktokEvent(e);
      (w.ttq?.track as ((...a: unknown[]) => void) | undefined)?.(
        t.name,
        t.params,
        t.eventId ? { event_id: t.eventId } : undefined,
      );
    }
  } catch {
    // An ad blocker or a pixel error: the shopper carries on.
  }
}
