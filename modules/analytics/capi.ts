import { createHash } from "node:crypto";
import { enqueueMetaEvent, type MetaEventJob } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { analyticsSettings } from "@/modules/integrations/store";
import { metaEvent, purchaseEventId, type ShopItem } from "./events";

/**
 * Meta Conversions API (FR-AD-13, SRS §8.7): each website order is also sent from the server, so it
 * counts even when an ad blocker stops the browser pixel. It carries the same event id as the
 * browser's Purchase, so Meta counts it once. Customer details are hashed as Meta asks; nothing is
 * sent without the pixel ID and access token saved in Admin → Integrations.
 */

/** Graph API version. Meta supports each for about two years; bump it when Events Manager warns. */
export const GRAPH_VERSION = "v23.0";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Meta's rules: phone as digits with the country code, email lower-case and trimmed. */
export function hashedUserData(u: {
  phone: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
}): Record<string, string | string[]> {
  const phone = u.phone.replace(/\D/g, "");
  const email = u.email.trim().toLowerCase();
  return {
    ph: [sha256(phone)],
    external_id: [sha256(phone)],
    country: [sha256("bd")],
    ...(email ? { em: [sha256(email)] } : {}),
    ...(u.ip ? { client_ip_address: u.ip } : {}),
    ...(u.userAgent ? { client_user_agent: u.userAgent } : {}),
    ...(u.fbp ? { fbp: u.fbp } : {}),
    ...(u.fbc ? { fbc: u.fbc } : {}),
  };
}

export function purchaseJob(o: {
  orderNo: string;
  placedAt: Date;
  total: number;
  items: ShopItem[];
  url: string;
  user: Parameters<typeof hashedUserData>[0];
}): MetaEventJob {
  const m = metaEvent({ name: "purchase", orderNo: o.orderNo, value: o.total, items: o.items });
  return {
    eventName: m.name,
    eventId: purchaseEventId(o.orderNo),
    eventTime: Math.floor(o.placedAt.getTime() / 1000),
    eventSourceUrl: o.url,
    userData: hashedUserData(o.user),
    customData: m.data,
  };
}

/** Queues an order's Purchase when the Conversions API is set up. Never throws: orders don't wait on ads. */
export async function queuePurchaseEvent(o: Parameters<typeof purchaseJob>[0]): Promise<boolean> {
  try {
    const s = await analyticsSettings();
    if (!s.metaPixelId || !s.metaCapiToken) return false;
    await enqueueMetaEvent(purchaseJob(o));
    return true;
  } catch (err) {
    logger.warn({ err, orderNo: o.orderNo }, "couldn't queue the Meta purchase event");
    return false;
  }
}

export class MetaSendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

/** In the worker: sends one event. Settings removed since it was queued = nothing to do. */
export async function sendMetaEvent(job: MetaEventJob, fetchFn: typeof fetch = fetch) {
  const s = await analyticsSettings();
  if (!s.metaPixelId || !s.metaCapiToken) return { skipped: "Conversions API is off" };
  const body = {
    data: [
      {
        event_name: job.eventName,
        event_time: job.eventTime,
        event_id: job.eventId,
        event_source_url: job.eventSourceUrl,
        action_source: "website",
        user_data: job.userData,
        custom_data: job.customData,
      },
    ],
    ...(s.metaTestCode ? { test_event_code: s.metaTestCode } : {}),
    // In the body, not the address, so it never lands in a proxy's request log.
    access_token: s.metaCapiToken,
  };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(s.metaPixelId)}/events`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const reply = (await res.json().catch(() => ({}))) as {
    events_received?: number;
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    const message = `Meta Conversions API ${res.status}: ${reply.error?.message ?? "no details"}`;
    // A bad token or pixel (400/401/403) won't fix itself by trying again.
    throw new MetaSendError(message, res.status >= 400 && res.status < 500 && res.status !== 429);
  }
  return { received: reply.events_received ?? 0 };
}
