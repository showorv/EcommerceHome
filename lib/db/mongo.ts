import { MongoClient, type Db } from "mongodb";
import mongoose from "mongoose";
import { env } from "@/lib/env";

/**
 * One MongoClient (used by Better Auth) and one Mongoose connection (used by our domain models).
 * Cached on globalThis so Next.js hot reload in development does not open new pools each time.
 */
type Cache = {
  client?: MongoClient;
  mongoose?: Promise<typeof mongoose>;
};

const g = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = (g.__mongo ??= {});

export function mongoClient(): MongoClient {
  if (!cache.client) {
    cache.client = new MongoClient(env().MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5_000,
    });
  }
  return cache.client;
}

/** Database handle for the native driver. The client connects lazily on first operation. */
export function mongoDb(): Db {
  return mongoClient().db();
}

/** Connects Mongoose once. Call before using any Mongoose model. */
export function connectMongoose(): Promise<typeof mongoose> {
  if (!cache.mongoose) {
    mongoose.set("strictQuery", true);
    // Blocks `$where`, `$ne` etc. coming from user input in filters (NFR-SEC-09).
    mongoose.set("sanitizeFilter", true);
    cache.mongoose = mongoose
      .connect(env().MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 5_000 })
      .catch((err) => {
        cache.mongoose = undefined;
        throw err;
      });
  }
  return cache.mongoose;
}
