/**
 * Error tracking in the browser (NFR-AV-03). Sentry's code is only downloaded when an error actually
 * happens, so shoppers' phones don't load it on every page (NFR-PF-02). Needs NEXT_PUBLIC_SENTRY_DSN
 * when the shop is built.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== "undefined") {
  let sentry: Promise<typeof import("@sentry/nextjs")> | null = null;
  const load = () =>
    (sentry ??= Promise.all([import("@sentry/nextjs"), import("@/modules/monitoring/scrub")]).then(
      ([Sentry, { SENTRY_COMMON, scrubEvent }]) => {
        Sentry.init({
          dsn,
          ...SENTRY_COMMON,
          beforeSend: (event) => scrubEvent(event),
          // This file reports errors itself; Sentry's own listeners would see them twice.
          integrations: (all) => all.filter((i) => i.name !== "GlobalHandlers"),
        });
        return Sentry;
      },
    ));
  const report = (error: unknown) => {
    void load()
      .then((Sentry) => Sentry.captureException(error))
      .catch(() => undefined);
  };
  window.addEventListener("error", (e) => {
    // Errors from other sites' scripts (pixels, extensions) carry no details: not ours to fix.
    if (e.error) report(e.error);
  });
  window.addEventListener("unhandledrejection", (e) => report(e.reason));
}
