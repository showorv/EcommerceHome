import Redis from "ioredis";
import { env } from "@/lib/env";

const g = globalThis as unknown as { __redis?: Redis };

/** Shared Redis connection for cache, rate limits and auth secondary storage. */
export function redis(): Redis {
  if (!g.__redis) {
    g.__redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return g.__redis;
}

/** BullMQ needs its own connections with `maxRetriesPerRequest: null`. */
export function bullConnection() {
  return { url: env().REDIS_URL, maxRetriesPerRequest: null } as const;
}
