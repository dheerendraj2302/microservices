import Fastify, { type FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import type { Pool } from "pg";
import { z } from "zod";

export interface Cache {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttl: number, value: string): Promise<unknown>;
  del(keys: string | string[]): Promise<unknown>;
  scanIterator(options?: { MATCH?: string; COUNT?: number }): AsyncIterable<string[]>;
}

export interface CatalogOptions {
  db: Pick<Pool, "query">;
  cache?: Cache;
  cacheTtlSeconds?: number;
  dbDelayMs?: number;
}

const idSchema = z.coerce.number().int().positive();
const productBody = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  category: z.string().trim().min(1).max(80),
  price: z.coerce.number().nonnegative().multipleOf(0.01),
  stock: z.coerce.number().int().nonnegative()
}).strict();
const listQuery = z.object({
  search: z.string().trim().max(160).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function buildApp(options: CatalogOptions): FastifyInstance {
  const app = Fastify({
    logger: { base: { service: "catalog-service" } },
    requestIdHeader: "x-request-id"
  });
  void app.register(cors, { origin: ["http://localhost:3000", "http://localhost:3001"] });
  void app.register(compress);
  const ttl = options.cacheTtlSeconds ?? 60;
  const delay = options.dbDelayMs ?? 700;

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      event: "request_completed",
      requestId: request.id,
      service: "catalog-service",
      method: request.method,
      endpoint: request.routeOptions.url,
      statusCode: reply.statusCode,
      duration: reply.elapsedTime,
      cache: reply.getHeader("x-cache")
    });
  });

  const cached = async <T>(key: string, bypass: boolean, load: () => Promise<T>): Promise<{ value: T; cache: "HIT" | "MISS" | "BYPASS"; duration: number }> => {
    const started = performance.now();
    if (options.cache && !bypass) {
      try {
        const value = await options.cache.get(key);
        if (value !== null) return { value: JSON.parse(value) as T, cache: "HIT", duration: performance.now() - started };
      } catch (error) {
        app.log.warn({ err: error, key }, "Redis unavailable; falling back to database");
      }
    }
    await sleep(delay);
    const value = await load();
    if (options.cache && !bypass) {
      try {
        await options.cache.setEx(key, ttl, JSON.stringify(value));
      } catch (error) {
        app.log.warn({ err: error, key }, "cache write failed; returning database result");
      }
    }
    return { value, cache: bypass ? "BYPASS" : "MISS", duration: performance.now() - started };
  };

  const invalidate = async (id?: number) => {
    if (!options.cache) return;
    try {
      const keys: string[] = [];
      for (const pattern of ["products:list:*", "products:category:*"]) {
        for await (const batch of options.cache.scanIterator({ MATCH: pattern, COUNT: 100 })) keys.push(...batch);
      }
      if (id) keys.push(`product:${id}`);
      if (keys.length) await options.cache.del(keys);
    } catch (error) {
      app.log.warn({ err: error }, "cache invalidation failed");
    }
  };

  app.get("/health", async (_request, reply) => {
    try {
      await options.db.query("SELECT 1");
      return reply.header("X-Cache", "BYPASS").send({ status: "ok", service: "catalog-service" });
    } catch {
      return reply.code(503).header("X-Cache", "BYPASS").send({ status: "unhealthy", service: "catalog-service" });
    }
  });

  app.get("/products", async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).header("X-Cache", "BYPASS").send({ error: "Invalid query", details: parsed.error.flatten() });
    const query = parsed.data;
    const prefix = query.category ? `products:category:${query.category.toLowerCase()}` : "products:list";
    const key = `${prefix}:${Buffer.from(JSON.stringify(query)).toString("base64url")}`;
    const bypass = request.headers["cache-control"]?.includes("no-cache") ?? false;
    const result = await cached(key, bypass, async () => {
      const filters: string[] = [];
      const values: unknown[] = [];
      if (query.search) {
        values.push(`%${query.search}%`);
        filters.push(`(name || ' ' || description) ILIKE $${values.length}`);
      }
      if (query.category) {
        values.push(query.category);
        filters.push(`category = $${values.length}`);
      }
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const count = await options.db.query(`SELECT COUNT(*)::int AS total FROM products ${where}`, values);
      values.push(query.limit, (query.page - 1) * query.limit);
      const rows = await options.db.query(
        `SELECT id, name, description, category, price::float8 AS price, stock, created_at, updated_at
         FROM products ${where} ORDER BY id LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      const total = Number(count.rows[0]?.total ?? 0);
      return { items: rows.rows, page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) };
    });
    return reply.header("X-Cache", result.cache).header("Server-Timing", `catalog;dur=${result.duration.toFixed(1)}`).send(result.value);
  });

  app.get("/products/:id", async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).header("X-Cache", "BYPASS").send({ error: "Invalid product id" });
    const bypass = request.headers["cache-control"]?.includes("no-cache") ?? false;
    const result = await cached(`product:${id.data}`, bypass, async () => {
      const row = await options.db.query(
        "SELECT id, name, description, category, price::float8 AS price, stock, created_at, updated_at FROM products WHERE id = $1",
        [id.data]
      );
      return row.rows[0] ?? null;
    });
    if (!result.value) return reply.code(404).header("X-Cache", result.cache).send({ error: "Product not found" });
    return reply.header("X-Cache", result.cache).header("Server-Timing", `catalog;dur=${result.duration.toFixed(1)}`).send(result.value);
  });

  app.post("/products", async (request, reply) => {
    const body = productBody.safeParse(request.body);
    if (!body.success) return reply.code(400).header("X-Cache", "BYPASS").send({ error: "Invalid product", details: body.error.flatten() });
    const p = body.data;
    const result = await options.db.query(
      `INSERT INTO products (name, description, category, price, stock) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, description, category, price::float8 AS price, stock, created_at, updated_at`,
      [p.name, p.description, p.category, p.price, p.stock]
    );
    await invalidate();
    return reply.code(201).header("X-Cache", "BYPASS").send(result.rows[0]);
  });

  app.put("/products/:id", async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    const body = productBody.safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).header("X-Cache", "BYPASS").send({ error: "Invalid product update" });
    const product = body.data;
    const result = await options.db.query(
      `UPDATE products SET name = $1, description = $2, category = $3, price = $4, stock = $5, updated_at = NOW() WHERE id = $6
       RETURNING id, name, description, category, price::float8 AS price, stock, created_at, updated_at`,
      [product.name, product.description, product.category, product.price, product.stock, id.data]
    );
    if (!result.rows[0]) return reply.code(404).header("X-Cache", "BYPASS").send({ error: "Product not found" });
    await invalidate(id.data);
    return reply.header("X-Cache", "BYPASS").send(result.rows[0]);
  });

  app.delete("/products/:id", async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).header("X-Cache", "BYPASS").send({ error: "Invalid product id" });
    const result = await options.db.query("DELETE FROM products WHERE id = $1 RETURNING id", [id.data]);
    if (!result.rows[0]) return reply.code(404).header("X-Cache", "BYPASS").send({ error: "Product not found" });
    await invalidate(id.data);
    return reply.code(204).header("X-Cache", "BYPASS").send();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "Internal server error" });
  });
  return app;
}
