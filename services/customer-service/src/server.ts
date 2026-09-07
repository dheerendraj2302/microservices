import { Pool } from "pg";
import { z } from "zod";
import { buildApp } from "./app.js";

const env = z.object({
  PORT: z.coerce.number().int().positive().default(4003),
  DATABASE_URL: z.string().url(),
  ORDER_SERVICE_URL: z.string().url().default("http://localhost:4002"),
  ORDER_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(1500)
}).parse(process.env);

const db = new Pool({ connectionString: env.DATABASE_URL });
const app = buildApp({
  db,
  orderServiceUrl: env.ORDER_SERVICE_URL,
  orderServiceTimeoutMs: env.ORDER_SERVICE_TIMEOUT_MS
});
const shutdown = async () => {
  await app.close();
  await db.end();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
