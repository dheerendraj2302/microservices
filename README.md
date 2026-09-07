# Local Customer Portal POC

A local-only demonstration of microservices, micro frontends, caching, and measurable performance. Everything runs with Docker Compose; there is no cloud infrastructure.

## Architecture

- `shell-app` (`:3000`) owns the dashboard, navigation, route composition, and unavailable-zone fallback.
- `catalog-app` (`:3001/catalog`) and `orders-app` (`:3002/orders`) are independent Next.js applications.
- `catalog-service` (`:4001`) owns products and Redis cache-aside behavior.
- `order-service` (`:4002`) owns orders and order items.
- `customer-service` (`:4003`) owns customers and calls Order Service over HTTP for summaries.
- One PostgreSQL container hosts three separately credentialed databases. Redis is optional for correctness.

See [architecture](docs/architecture.md), [microservices](docs/microservices.md), [micro frontends](docs/micro-frontends.md), [caching](docs/caching.md), and [performance](docs/performance.md).

## Prerequisites

- Docker Desktop with Compose v2
- Node.js 22+ and npm 11+ for host-side development

## Start locally

1. Copy `.env.example` to `.env`.
2. Replace each password placeholder with a different URL-safe local password. Do not commit `.env`.
3. Start the complete system:

```bash
docker compose up --build
```

PostgreSQL initialization creates `catalog_db`, `order_db`, and `customer_db`, applies indexes, and inserts deterministic demo data.

## Ports

| Component | URL |
|---|---|
| Shell and customer dashboard | http://localhost:3000 |
| Catalog standalone zone | http://localhost:3001/catalog |
| Orders standalone zone | http://localhost:3002/orders |
| Catalog API | http://localhost:4001 |
| Order API | http://localhost:4002 |
| Customer API | http://localhost:4003 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

The shell proxies `/catalog` and `/orders` to the independent zones. Cross-zone links use document navigation, so Catalog or Orders assets are not downloaded from the home page.

## Useful API calls

```bash
curl -i http://localhost:4001/health
curl -i http://localhost:4001/products
curl -i "http://localhost:4001/products?category=Electronics&page=1&limit=12"
curl -i http://localhost:4001/products/1
curl -i http://localhost:4002/orders/1
curl -i http://localhost:4002/orders/1/1
curl -i http://localhost:4003/customers/1
curl -i -H "x-request-id: interview-demo-1" http://localhost:4003/customers/1/summary
```

Product writes use JSON:

```bash
curl -i -X POST http://localhost:4001/products \
  -H "content-type: application/json" \
  -d '{"name":"Demo Stand","description":"Interview demo product","category":"Office","price":19.99,"stock":8}'
```

`PUT /products/:id` performs full replacement; `DELETE /products/:id` removes a product. Writes invalidate the item and all list/category cache entries.

## Make caching visible

```bash
curl -i -H "Cache-Control: no-cache" http://localhost:4001/products
curl -i "http://localhost:4001/products?search=cache-demo"
curl -i "http://localhost:4001/products?search=cache-demo"
```

Inspect `X-Cache: BYPASS`, then `MISS`, then `HIT`, plus measured `Server-Timing`. Only a database path receives the configured 700 ms demonstration delay.

## Benchmark

With Compose running:

```bash
npm run benchmark:no-cache
npm run benchmark:cache
```

Each mode performs 30 sequential requests by default and reports request count, HIT/MISS/BYPASS counts, average/min/max, P50, P95, and requests/second. Results are measured from the current machine and saved under `scripts/performance/results`; no latency value is hardcoded.

## Tests and builds

```bash
npm install
npm test
npm run typecheck
npm run build
docker compose config --no-interpolate
```

Each backend has its own package, tests, Dockerfile, environment contract, API, and health endpoint.

## Failure demonstrations

See [failure scenarios](docs/failure-scenarios.md) for safe commands and expected logs.

- Stop Redis: product reads continue from PostgreSQL and log `Redis unavailable; falling back to database`.
- Stop Order Service: customer summary returns customer data with `degraded: true`.
- Stop Catalog App: shell and Orders continue; `/catalog` renders `Catalog is currently unavailable.`
- Bypass/clear cache: database-only delay is visible, while a repeated cached query is fast.

## Compatibility decision

Runtime `@module-federation/nextjs-mf` was evaluated first as requested. The secure Next.js `15.5.24` build failed with `_resolveContext_stack.delete is not a function`, including after the plugin and applications were unified on webpack `5.98.0`. Downgrading Next.js would reintroduce critical security advisories. The POC therefore uses Next.js `16.3.4` Multi-Zones, the officially supported Next.js micro-frontend approach. The trade-off is route-level integration rather than runtime component federation.

## Acceptance checklist

- [x] Three independent backend services and APIs
- [x] Separate service packages, tests, Dockerfiles, configuration, and health endpoints
- [x] Separate PostgreSQL ownership credentials/databases
- [x] Customer-to-Order HTTP call with request-ID propagation and graceful degradation
- [x] Catalog Redis cache-aside, TTL, visible status, invalidation, and fallback
- [x] Actual P50/P95/RPS benchmark implementation
- [x] Three independent Next.js applications
- [x] Route-level lazy loading and code splitting
- [x] Shell fallback when either frontend zone is unavailable
- [x] Structured local JSON logs and database indexes/pooling/pagination/compression
- [x] Eight-service Docker Compose topology and health checks
- [x] Architecture/trade-off documentation and 10–15 minute demo script

## Documentation

- [Architecture](docs/architecture.md)
- [Microservices](docs/microservices.md)
- [Micro frontends](docs/micro-frontends.md)
- [Caching](docs/caching.md)
- [Performance](docs/performance.md)
- [Failure scenarios](docs/failure-scenarios.md)
- [Presentation script](docs/demo.md)
# Local Customer Portal POC

A local, containerized customer portal demonstrating independently owned frontend zones, Fastify microservices, database-per-service ownership, cache-aside behavior, request correlation, graceful degradation, and repeatable performance measurements.

## Architecture at a glance

- **Shell:** Next.js `16.3.4` Pages Router on `http://localhost:3000`, started through `apps/shell/server.js`.
- **Frontend composition:** the shell's local Node proxy routes `/catalog/**` to the catalog zone on `:3001` and `/orders/**` to the orders zone on `:3002`. Each zone has the matching Next.js `basePath`.
- **APIs:** catalog `:4001`, order `:4002`, and customer `:4003`, all using Fastify.
- **Data:** one PostgreSQL container hosting separately owned `catalog_db`, `order_db`, and `customer_db`; Redis `7.4` stores catalog read-cache entries.
- **Runtime:** Docker Compose starts eight containers: PostgreSQL, Redis, three APIs, and three frontend apps.

See [Architecture](docs/architecture.md), [Microservices](docs/microservices.md), and [Micro-frontends](docs/micro-frontends.md) for details.

## Prerequisites

- Docker Desktop with Docker Compose
- Node.js 22+ and npm 11+ only if running workspace commands outside containers
- `curl` for the command-line examples

## Setup and run

From the repository root:

```bash
cp .env.example .env
```

Open `.env` and replace every placeholder with a password you supply. Use different local passwords for the PostgreSQL administrator and each service user. No working credentials are committed or documented.

Start and build the complete stack:

```bash
docker compose up --build -d
docker compose ps
```

Follow logs or stop the stack:

```bash
docker compose logs -f
docker compose down
```

`docker compose down` preserves named database and Redis volumes. `docker compose down -v` destroys local POC data and should be used only when a clean reseed is intended.

For host-based development, first start PostgreSQL and Redis, then provide each workspace's documented environment variables before running:

```bash
npm install
npm run dev
```

The root `.env` is primarily Docker Compose configuration; host processes do not automatically receive every service-specific connection string.

## Ports

| Port | Component | Main URL |
| --- | --- | --- |
| 3000 | Shell and public route entry | `http://localhost:3000` |
| 3001 | Catalog zone (direct) | `http://localhost:3001/catalog` |
| 3002 | Orders zone (direct) | `http://localhost:3002/orders` |
| 4001 | Catalog API | `http://localhost:4001` |
| 4002 | Order API | `http://localhost:4002` |
| 4003 | Customer API | `http://localhost:4003` |
| 5432 | PostgreSQL | local database access |
| 6379 | Redis 7.4 | local cache access |

Normal browser navigation starts at `:3000`; ports `3001` and `3002` are useful for ownership and failure demonstrations.

## API endpoints

### Catalog API (`:4001`)

- `GET /health`
- `GET /products?search=&category=&page=1&limit=20`
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id`

Catalog reads return `X-Cache: HIT`, `MISS`, or `BYPASS`. Successful reads also return `Server-Timing`. Send `Cache-Control: no-cache` to force the database path.

### Order API (`:4002`)

- `GET /health`
- `GET /orders/:customerId?page=1&limit=20`
- `GET /orders/:customerId/:orderId`
- `POST /orders`

### Customer API (`:4003`)

- `GET /health`
- `GET /customers/:id`
- `GET /customers/:id/summary`

The summary endpoint calls the order service over HTTP and forwards `x-request-id`. If orders are unavailable or time out, it returns the customer with a degraded order summary.

Examples:

```bash
curl -i http://localhost:4001/products
curl -i -H "Cache-Control: no-cache" http://localhost:4001/products
curl -i http://localhost:4002/orders/1
curl -i -H "x-request-id: demo-001" http://localhost:4003/customers/1/summary
```

## Validation and benchmarks

```bash
npm run typecheck
npm test
npm run build
npm run benchmark:no-cache
npm run benchmark:cache
```

Run benchmarks while the catalog API is available. The scripts make 30 sequential requests by default and write actual measurements at runtime to `scripts/performance/results/no-cache.json` and `cache.json`. They report cache classifications, average/min/max/P50/P95 latency, and a sequential-request rate; the repository does not claim fixed benchmark numbers.

Use `BENCHMARK_URL` and `BENCHMARK_REQUESTS` in `.env` or the process environment to change the target and sample count. See [Performance](docs/performance.md).

## Acceptance checklist

- [ ] `.env` exists and all password placeholders have been replaced by user-supplied values.
- [ ] `docker compose ps` shows all eight containers running and healthy where health checks apply.
- [ ] `http://localhost:3000` loads customer 1's summary.
- [ ] `/catalog` and `/orders` remain on the `:3000` origin during normal navigation.
- [ ] Catalog search, category filter, pagination, and product detail work.
- [ ] Orders lookup for customer `1` and order detail work.
- [ ] First catalog read is `MISS`, a repeated read is `HIT`, and a no-cache read is `BYPASS`.
- [ ] Catalog remains usable through the database path when Redis is stopped.
- [ ] Customer summary becomes degraded, but still returns customer data, when the order service is stopped.
- [ ] Stopping `catalog-app` shows the shell's zone-unavailable page for `/catalog`; restoring it and hard-refreshing recovers.
- [ ] Type checks, tests, and production builds pass.
- [ ] Both benchmark modes generate runtime result files.

## Troubleshooting

**Compose rejects missing variables:** copy `.env.example` to `.env` and replace all placeholders. Do not paste passwords into commands, logs, source files, or documentation.

**A database or role change is not applied:** initialization scripts run only when the PostgreSQL volume is first created. If losing local POC data is acceptable, run `docker compose down -v`, then `docker compose up --build -d`.

**Port already in use:** stop the local process using one of ports `3000-3002`, `4001-4003`, `5432`, or `6379`, then restart Compose.

**A restored frontend still shows an error:** wait for `docker compose ps` to report the app healthy, then perform a browser hard refresh. A failed proxied navigation can leave an error document in the current tab.

**Catalog requests take about 700 ms:** this is intentional on `MISS` and `BYPASS`. `DB_DELAY_MS=700` simulates latency only on the database read path; cache hits skip it.

**Redis is down:** catalog reads should fall back to PostgreSQL and log a warning. Expect no cache speedup until Redis returns.

**Summary has no orders:** inspect `docker compose logs customer-service order-service`. The customer service intentionally returns HTTP 200 with `degraded: true` when its order dependency fails.

**Zone works directly but not through the shell:** confirm `CATALOG_ZONE_URL` and `ORDERS_ZONE_URL` use Compose service names inside containers. Route-level composition and recovery are covered in [Failure scenarios](docs/failure-scenarios.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Microservices](docs/microservices.md)
- [Micro-frontends](docs/micro-frontends.md)
- [Caching](docs/caching.md)
- [Performance](docs/performance.md)
- [Failure scenarios](docs/failure-scenarios.md)
- [10–15 minute demo](docs/demo.md)
