import type Redis from "ioredis";

/**
 * Per-account sign-in lockout (NFR-SEC-05): 5 failed attempts within 15 minutes lock the
 * account for 15 minutes. Works together with Better Auth's per-IP rate limit.
 * Identifiers are hashed-free but normalised (lower-case email / +880 phone) — they are
 * Redis keys only and expire on their own.
 */
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_SECONDS = 15 * 60;

const failKey = (id: string) => `signin:fail:${id}`;
const lockKey = (id: string) => `signin:lock:${id}`;

export async function isLocked(client: Redis, identifier: string): Promise<boolean> {
  return (await client.exists(lockKey(identifier))) === 1;
}

export async function recordFailure(client: Redis, identifier: string): Promise<{ locked: boolean; failures: number }> {
  const res = await client.multi().incr(failKey(identifier)).expire(failKey(identifier), LOCK_SECONDS, "NX").exec();
  const failures = Number(res?.[0]?.[1] ?? 0);
  if (failures >= MAX_FAILED_SIGN_INS) {
    await client.multi().set(lockKey(identifier), "1", "EX", LOCK_SECONDS).del(failKey(identifier)).exec();
    return { locked: true, failures };
  }
  return { locked: false, failures };
}

export async function clearFailures(client: Redis, identifier: string): Promise<void> {
  await client.del(failKey(identifier));
}
