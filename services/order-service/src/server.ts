import { Pool } from "pg";
import { z } from "zod";
import { buildApp } from "./app.js";

const env = z.object({
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().url()
}).parse(process.env);

const db = new Pool({ connectionString: env.DATABASE_URL });
const app = buildApp(db);
const shutdown = async () => {
  await app.close();
  await db.end();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
