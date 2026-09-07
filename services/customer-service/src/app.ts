import Fastify, { type FastifyInstance } from "fastify";
import compress from "@fastify/compress";
import cors from "@fastify/cors";
import type { Pool } from "pg";
import { z } from "zod";

export interface CustomerOptions {
  db: Pick<Pool, "query">;
  orderServiceUrl: string;
  orderServiceTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const idSchema = z.coerce.number().int().positive();
const orderResponse = z.object({
  items: z.array(z.object({
    id: z.number(),
    total: z.number(),
    status: z.string()
  }).passthrough())
}).passthrough();

export function buildApp(options: CustomerOptions): FastifyInstance {
  const app = Fastify({
    logger: { base: { service: "customer-service" } },
    requestIdHeader: "x-request-id"
  });
  void app.register(cors, { origin: ["http://localhost:3000"] });
  void app.register(compress);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.orderServiceTimeoutMs ?? 1500;

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.addHook("onResponse", async (request, reply) => {
    request.log.info({
      event: "request_completed", requestId: request.id, service: "customer-service", method: request.method,
      endpoint: request.routeOptions.url, statusCode: reply.statusCode, duration: reply.elapsedTime
    });
  });

  app.get("/health", async (_request, reply) => {
    try {
      await options.db.query("SELECT 1");
      return { status: "ok", service: "customer-service" };
    } catch {
      return reply.code(503).send({ status: "unhealthy", service: "customer-service" });
    }
  });

  const loadCustomer = async (customerId: number) => {
    const result = await options.db.query(
      "SELECT id, first_name, last_name, email, phone, created_at FROM customers WHERE id = $1",
      [customerId]
    );
    return result.rows[0] ?? null;
  };

  app.get("/customers/:id", async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Invalid customer id" });
    const customer = await loadCustomer(id.data);
    if (!customer) return reply.code(404).send({ error: "Customer not found" });
    return customer;
  });

  app.get("/customers/:id/summary", async (request, reply) => {
    const id = idSchema.safeParse((request.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "Invalid customer id" });
    const customer = await loadCustomer(id.data);
    if (!customer) return reply.code(404).send({ error: "Customer not found" });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${options.orderServiceUrl}/orders/${id.data}?limit=5`, {
        signal: controller.signal,
        headers: { "x-request-id": request.id }
      });
      if (!response.ok) throw new Error(`order service returned ${response.status}`);
      const orders = orderResponse.parse(await response.json());
      return {
        customer,
        orders: orders.items,
        orderSummary: {
          available: true,
          count: orders.items.length,
          totalSpent: Number(orders.items.reduce((sum, order) => sum + order.total, 0).toFixed(2))
        }
      };
    } catch (error) {
      request.log.warn({ err: error, customerId: id.data }, "order service unavailable; returning degraded summary");
      return {
        customer,
        orders: [],
        orderSummary: { available: false, count: 0, totalSpent: null },
        degraded: true,
        warning: "Order service is currently unavailable"
      };
    } finally {
      clearTimeout(timer);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "Internal server error" });
  });
  return app;
}
