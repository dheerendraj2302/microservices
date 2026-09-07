# 10–15 minute demonstration

## 1. Architecture (1 minute)

Open `docs/architecture.md`. Explain the browser → Shell/Multi-Zones → independently owned APIs → three PostgreSQL databases plus Redis. Point out that one Postgres container is a local cost choice, while credentials/database ownership enforce boundaries.

## 2. Independent services (2 minutes)

Start with `docker compose up --build`, then:

```bash
curl -i http://localhost:4001/products
curl -i http://localhost:4002/orders/1
curl -i http://localhost:4003/customers/1
```

Show three ports, health endpoints, package manifests, Dockerfiles, and logs.

## 3. Service-to-service communication (1 minute)

```bash
curl -i -H "x-request-id: review-123" http://localhost:4003/customers/1/summary
```

Show `review-123` in Customer and Order Service logs. Explain that Customer Service owns no order credentials and combines an HTTP response.

## 4. Micro frontends (2 minutes)

Open `http://localhost:3000`, then navigate Dashboard → Catalog → Orders. Also open `http://localhost:3001/catalog` and `http://localhost:3002/orders` directly. Explain independent builds and route-level Next.js Multi-Zone composition.

In browser Network tools, hard-refresh the dashboard: no Catalog/Orders zone document/chunks load. Navigate to one zone and show its resources arriving only then.

## 5. Frontend failure isolation (1 minute)

```bash
docker compose stop catalog-app
```

Hard-refresh `/catalog`; show the unavailable message. Dashboard and Orders still work. Restart with `docker compose start catalog-app`.

## 6. Cache-aside and visible latency (2 minutes)

Use a new search key:

```bash
curl -i "http://localhost:4001/products?search=presentation-demo"
curl -i "http://localhost:4001/products?search=presentation-demo"
```

Show MISS then HIT, `Server-Timing`, and measured completion logs. Explain Redis lookup → database on miss → SET with TTL → response. Mention that writes invalidate item/list/category keys.

## 7. Benchmark (2 minutes)

```bash
npm run benchmark:no-cache
npm run benchmark:cache
```

Show actual average/min/max/P50/P95/RPS and cache counts. Clarify that 700 ms is an intentional database-path control; the benchmark measurements themselves are real.

## 8. Redis failure (1 minute)

```bash
docker compose stop redis
curl -i "http://localhost:4001/products?search=redis-failure"
```

Show successful PostgreSQL fallback and warning log. Restart Redis. Explain why a cache should not be the correctness dependency.

## 9. Trade-offs (2 minutes)

- Microservices provide ownership, independent change/deployment, and failure boundaries, but add network/operational complexity.
- Multi-Zones provide independent frontend route ownership/builds and coarse failure isolation, but cross-zone navigation reloads and shell consistency needs discipline.
- Redis removes repeated expensive work, but adds stale-data, invalidation, memory, and availability concerns.
- For a small single-team portal without independent release needs, use a modular monolith and one frontend; these patterns must earn their complexity.

Close by noting the compatibility decision in `docs/micro-frontends.md`: insecure Next.js downgrades were rejected when the maintenance-mode federation plugin failed its production-build gate.
