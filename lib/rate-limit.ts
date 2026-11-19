import type Redis from "ioredis";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Fixed-window rate limiter on Redis (NFR-SEC-05). Atomic: INCR + EXPIRE in one MULTI.
 * Key should identify the subject, e.g. `otp:phone:+8801…` or `checkout:ip:1.2.3.4`.
 */
export async function rateLimit(
  client: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const fullKey = `rl:${key}`;
  const res = await client.multi().incr(fullKey).expire(fullKey, windowSeconds, "NX").ttl(fullKey).exec();
  const count = Number(res?.[0]?.[1] ?? 0);
  const ttl = Number(res?.[2]?.[1] ?? windowSeconds);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
