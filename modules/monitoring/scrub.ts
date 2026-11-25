/**
 * What error reports may carry (NFR-AV-03: no personal data in logs). Sentry gets the error, where it
 * happened and the page address, never cookies, headers, form data, IP addresses or query strings
 * (which can hold phone numbers, search terms or tracking tokens).
 */

type Req = {
  url?: string;
  query_string?: unknown;
  cookies?: unknown;
  headers?: unknown;
  data?: unknown;
  env?: unknown;
};
type SentryLikeEvent = { request?: Req; user?: unknown; server_name?: string };

export function scrubEvent<E extends SentryLikeEvent>(event: E): E {
  if (event.request) {
    const url = event.request.url?.split("?")[0];
    event.request = url ? { url } : {};
  }
  delete event.user;
  delete event.server_name;
  return event;
}

export const SENTRY_COMMON = {
  sendDefaultPii: false,
  // Errors only: performance tracing would use up the free plan and isn't needed.
  tracesSampleRate: 0,
  environment: process.env.SENTRY_ENVIRONMENT || "production",
} as const;
