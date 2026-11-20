import mongoose from "mongoose";

/**
 * Mongoose runs with `sanitizeFilter` on (lib/db/mongo.ts), which neutralises `$` operators so
 * user input like `{ "$ne": "" }` can't change a query. Filters we build ourselves — from values
 * that already passed zod validation — still need operators such as `$in` or `$gte`.
 * `trustFilter` marks those operator objects as trusted. Never pass raw request data to it.
 */
export function trustFilter<T extends Record<string, unknown>>(filter: T): T {
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$nor") {
      if (Array.isArray(value)) value.forEach((sub) => trustFilter(sub as Record<string, unknown>));
      continue;
    }
    if (key.startsWith("$") || hasOperatorKeys(value)) {
      (filter as Record<string, unknown>)[key] = mongoose.trusted(value);
    }
  }
  return filter;
}

function hasOperatorKeys(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value) || value instanceof Date) return false;
  if (value instanceof mongoose.Types.ObjectId) return false;
  return Object.keys(value).some((k) => k.startsWith("$"));
}
