import Fastify, { type FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import type { Pool, PoolClient, QueryResult } from "pg";
import { z } from "zod";

type Queryable = { query(text: string, values?: unknown[]): Promise<QueryResult> };
export interface OrderDb extends Pick<Pool, "query"> {
  connect(): Promise<Pick<PoolClient, "query" | "release">>;
}

const id = z.coerce.number().int().positive();
const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();
const orderBody = z.object({
  customerId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    productName: z.string().trim().min(1).max(160),
    unitPrice: z.number().nonnegative().multipleOf(0.01),
    quantity: z.number().int().positive().max(1000)
  }).strict()).min(1).max(100)
}).strict();

const orderSelect = `
  SELECT o.id, o.customer_id, o.status, o.total::float8 AS total, o.created_at,
    COALESCE(json_agg(json_build_object(
      'id', i.id, 'productId', i.product_id, 'productName', i.product_name,
      'unitPrice', i.unit_price::float8, 'quantity', i.quantity,
      'lineTotal', i.line_total::float8
    ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
  FROM orders o LEFT JOIN order_items i ON i.order_id = o.id`;

export function buildApp(db: OrderDb): FastifyInstance {
  const app = Fastify({
    logger: { base: { service: "order-service" } },
    requestIdHeader: "x-request-id"
  });
  void app.register(cors, { origin: ["http://localhost:3000", "http://localhost:3002"] });
  void app.register(compress);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      event: "request_completed", requestId: request.id, service: "order-service", method: request.method,
      endpoint: request.routeOptions.url, statusCode: reply.statusCode, duration: reply.elapsedTime
    });
  });

  app.get("/health", async (_request, reply) => {
    try {
      await db.query("SELECT 1");
      return { status: "ok", service: "order-service" };
    } catch {
      return reply.code(503).send({ status: "unhealthy", service: "order-service" });
    }
  });

  app.get("/orders/:customerId", async (request, reply) => {
    const customerId = id.safeParse((request.params as { customerId?: string }).customerId);
    const query = listQuery.safeParse(request.query);
    if (!customerId.success || !query.success) return reply.code(400).send({ error: "Invalid customer id or pagination" });
    const result = await db.query(
      `${orderSelect} WHERE o.customer_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [customerId.data, query.data.limit, (query.data.page - 1) * query.data.limit]
    );
    return { items: result.rows, page: query.data.page, limit: query.data.limit };
  });

  app.get("/orders/:customerId/:orderId", async (request, reply) => {
    const params = request.params as { customerId?: string; orderId?: string };
    const customerId = id.safeParse(params.customerId);
    const orderId = id.safeParse(params.orderId);
    if (!customerId.success || !orderId.success) return reply.code(400).send({ error: "Invalid id" });
    const result = await db.query(
      `${orderSelect} WHERE o.customer_id = $1 AND o.id = $2 GROUP BY o.id`,
      [customerId.data, orderId.data]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Order not found" });
    return result.rows[0];
  });

  app.post("/orders", async (request, reply) => {
    const parsed = orderBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid order", details: parsed.error.flatten() });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const total = parsed.data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const order = await client.query(
        "INSERT INTO orders (customer_id, status, total) VALUES ($1, 'placed', $2) RETURNING id, customer_id, status, total::float8 AS total, created_at",
        [parsed.data.customerId, total.toFixed(2)]
      );
      const created = order.rows[0];
      for (const item of parsed.data.items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [created.id, item.productId, item.productName, item.unitPrice.toFixed(2), item.quantity, (item.unitPrice * item.quantity).toFixed(2)]
        );
      }
      await client.query("COMMIT");
      return reply.code(201).send({ ...created, items: parsed.data.items });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "Internal server error" });
  });
  return app;
}
