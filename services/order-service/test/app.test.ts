import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("order service", () => {
  it("lists customer orders using the injected database", async () => {
    const db = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 8, customer_id: 2, items: [] }] }),
      connect: vi.fn()
    };
    const app = buildApp(db as never);
    const response = await app.inject({ method: "GET", url: "/orders/2" });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(1);
    expect(db.query).toHaveBeenCalledOnce();
    await app.close();
  });

  it("rejects an empty order", async () => {
    const app = buildApp({ query: vi.fn(), connect: vi.fn() } as never);
    const response = await app.inject({ method: "POST", url: "/orders", payload: { customerId: 1, items: [] } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
