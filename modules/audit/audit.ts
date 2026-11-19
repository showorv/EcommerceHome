import { connectMongoose } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";
import { AuditLogModel } from "./audit-log.model";

export type AuditEntry = {
  actor: { id: string; email?: string | null } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/** Fields that must never be written to the audit log, at any depth. */
const SECRET_KEYS = new Set([
  "password",
  "passwordHash",
  "secret",
  "secretEnc",
  "token",
  "apiKey",
  "apiSecret",
  "backupCodes",
]);

function scrub(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.has(k) ? "[redacted]" : scrub(v, depth + 1);
  }
  return out;
}

/**
 * Writes one audit entry. Throws if the write fails, so callers that must be audited
 * (confirm, cancel, price change, settings) fail loudly instead of silently skipping it.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await connectMongoose();
  await AuditLogModel.create({
    actorId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: scrub(entry.before ?? null),
    after: scrub(entry.after ?? null),
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

/** Best-effort variant for events that must not break the main flow (e.g. sign-in events). */
export async function tryWriteAudit(entry: AuditEntry): Promise<void> {
  try {
    await writeAudit(entry);
  } catch (err) {
    logger.error({ err, action: entry.action }, "audit write failed");
  }
}

export { scrub as _scrubForTest };
