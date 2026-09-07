import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const customer = { id: 1, first_name: "Asha", last_name: "Sharma", email: "asha@example.test" };

describe("customer service", () => {
  it("propagates request id to the order service", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 2, status: "placed", total: 25 }]
    }), { status: 200 }));
    const app = buildApp({
      db: { query: vi.fn().mockResolvedValue({ rows: [customer] }) } as never,
      orderServiceUrl: "http://orders.test",
      fetchImpl
    });
    const response = await app.inject({ method: "GET", url: "/customers/1/summary", headers: { "x-request-id": "trace-123" } });
    expect(response.statusCode).toBe(200);
    expect(fetchImpl.mock.calls[0][1].headers["x-request-id"]).toBe("trace-123");
    expect(response.headers["x-request-id"]).toBe("trace-123");
    expect(response.json().orderSummary.available).toBe(true);
    await app.close();
  });

  it("returns a degraded summary when orders are unavailable", async () => {
    const app = buildApp({
      db: { query: vi.fn().mockResolvedValue({ rows: [customer] }) } as never,
      orderServiceUrl: "http://orders.test",
      fetchImpl: vi.fn().mockRejectedValue(new Error("offline"))
    });
    const response = await app.inject({ method: "GET", url: "/customers/1/summary" });
    expect(response.statusCode).toBe(200);
    expect(response.json().orderSummary.available).toBe(false);
    expect(response.json().degraded).toBe(true);
    await app.close();
  });
});
