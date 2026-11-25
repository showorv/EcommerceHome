/**
 * Start-up work that needs Node.js (imported by instrumentation.ts only in the Node runtime, so native
 * modules like the password hasher never reach the edge bundle).
 *
 * Creates the first Owner from OWNER_EMAIL / OWNER_PASSWORD when that account doesn't exist yet
 * (modules/auth/owner-from-env.ts). Never blocks start-up for long or stops it: a database hiccup is
 * logged and the shop starts anyway.
 */
export async function onNodeStart() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.OWNER_EMAIL && !process.env.OWNER_PASSWORD) return;
  const { ensureOwnerFromEnv } = await import("@/modules/auth/owner-from-env");
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 20_000).unref());
  try {
    const result = await Promise.race([ensureOwnerFromEnv(), timeout]);
    if (result === "timeout") console.error("Owner account from settings: the database didn't answer in time.");
  } catch (err) {
    console.error("Owner account from settings failed:", err instanceof Error ? err.message : err);
  }
}
