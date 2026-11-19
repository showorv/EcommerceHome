import { connection, NextResponse } from "next/server";
import { mongoDb } from "@/lib/db/mongo";
import { redis } from "@/lib/redis";

/** Health check for uptime monitoring (NFR-AV-01). Reports only up/down, nothing sensitive. */
export async function GET() {
  await connection(); // always run at request time, never prerender
  const [mongo, cache] = await Promise.allSettled([mongoDb().command({ ping: 1 }), redis().ping()]);
  const ok = mongo.status === "fulfilled" && cache.status === "fulfilled";
  return NextResponse.json(
    { ok, mongo: mongo.status === "fulfilled", redis: cache.status === "fulfilled" },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
