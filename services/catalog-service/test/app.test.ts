import { describe, expect, it, vi } from "vitest";
import { buildApp, type Cache } from "../src/app.js";

describe("catalog service", () => {
  it("serves a cached product without a database", async () => {
    const db = { query: vi.fn() };
    const cache: Cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify({ id: 1, name: "Cached" })),
      setEx: vi.fn(),
      del: vi.fn(),
      async *scanIterator() {}
    };
    const app = buildApp({ db: db as never, cache, dbDelayMs: 0 });
    const response = await app.inject({ method: "GET", url: "/products/1" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cache"]).toBe("HIT");
    expect(db.query).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects unknown product fields", async () => {
    const app = buildApp({ db: { query: vi.fn() } as never, dbDelayMs: 0 });
    const response = await app.inject({
      method: "POST",
      url: "/products",
      payload: { name: "A", description: "", category: "Tools", price: 10, stock: 1, unexpected: true }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("uses cache-aside with a TTL on a list miss", async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: "Database product" }] })
    };
    const cache: Cache = {
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn(),
      del: vi.fn(),
      async *scanIterator() {}
    };
    const app = buildApp({ db: db as never, cache, dbDelayMs: 0, cacheTtlSeconds: 60 });
    const response = await app.inject({ method: "GET", url: "/products" });
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(cache.setEx).toHaveBeenCalledWith(expect.stringMatching(/^products:list:/), 60, expect.any(String));
    await app.close();
  });

  it("bypasses Redis when the caller requests no-cache", async () => {
    const db = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
    };
    const cache: Cache = {
      get: vi.fn(),
      setEx: vi.fn(),
      del: vi.fn(),
      async *scanIterator() {}
    };
    const app = buildApp({ db: db as never, cache, dbDelayMs: 0 });
    const response = await app.inject({
      method: "GET",
      url: "/products",
      headers: { "cache-control": "no-cache" }
    });
    expect(response.headers["x-cache"]).toBe("BYPASS");
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.setEx).not.toHaveBeenCalled();
    await app.close();
  });

  it("falls back to the database when Redis is unavailable", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: 7, name: "From database" }] }) };
    const cache: Cache = {
      get: vi.fn().mockRejectedValue(new Error("Redis offline")),
      setEx: vi.fn().mockRejectedValue(new Error("Redis offline")),
      del: vi.fn(),
      async *scanIterator() {}
    };
    const app = buildApp({ db: db as never, cache, dbDelayMs: 0 });
    const response = await app.inject({ method: "GET", url: "/products/7" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(response.json().name).toBe("From database");
    await app.close();
  });
});
