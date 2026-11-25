import type { Instrumentation } from "next";

/**
 * Error tracking on the server (NFR-AV-03): Sentry starts only when SENTRY_DSN is set, and reports
 * errors without personal data (modules/monitoring/scrub.ts).
 */
export async function register() {
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
