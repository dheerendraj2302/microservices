import { Pool } from "pg";
import { createClient } from "redis";
import { z } from "zod";
import { buildApp } from "./app.js";

const env = z.object({
  PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CATALOG_DB_DEMO_DELAY_MS: z.coerce.number().int().nonnegative().default(700)
}).parse(process.env);

const db = new Pool({ connectionString: env.DATABASE_URL });
const redis = createClient({
  url: env.REDIS_URL,
  disableOfflineQueue: true,
  socket: { connectTimeout: 500, reconnectStrategy: false }
});
redis.on("error", (error) => console.warn(JSON.stringify({ level: "warn", message: "redis error", error: error.message })));
try {
  await redis.connect();
} catch (error) {
  console.warn(JSON.stringify({ level: "warn", message: "redis unavailable at startup; database fallback enabled", error: String(error) }));
}

const ensureRedis = async () => {
  if (!redis.isOpen) await redis.connect();
};
const cache = {
  async get(key: string) {
    await ensureRedis();
    return redis.get(key);
  },
  async setEx(key: string, ttl: number, value: string) {
    await ensureRedis();
    return redis.setEx(key, ttl, value);
  },
  async del(keys: string | string[]) {
    await ensureRedis();
    return redis.del(keys);
  },
  async *scanIterator(options?: { MATCH?: string; COUNT?: number }) {
    await ensureRedis();
    for await (const batch of redis.scanIterator(options)) yield batch;
  }
};

const app = buildApp({ db, cache, cacheTtlSeconds: env.CACHE_TTL_SECONDS, dbDelayMs: env.CATALOG_DB_DEMO_DELAY_MS });
const shutdown = async () => {
  await app.close();
  if (redis.isOpen) await redis.close();
  await db.end();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
