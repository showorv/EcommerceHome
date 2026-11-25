import type { Instrumentation } from "next";

/**
 * Runs once when the web server starts:
 * - creates the first Owner from OWNER_EMAIL / OWNER_PASSWORD when that account doesn't exist yet
 *   (instrumentation-node.ts);
 * - starts Sentry error tracking (NFR-AV-03) when SENTRY_DSN is set, reporting errors without
 *   personal data (modules/monitoring/scrub.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onNodeStart } = await import("./instrumentation-node");
    await onNodeStart();
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  const { SENTRY_COMMON, scrubEvent } = await import("@/modules/monitoring/scrub");
  Sentry.init({ dsn, ...SENTRY_COMMON, beforeSend: (event) => scrubEvent(event) });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
