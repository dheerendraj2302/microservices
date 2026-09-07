# Failure scenarios

Run these after `docker compose up --build`. `stop` preserves container state and volumes; do not use `down -v` unless you intentionally want to delete seeded/persistent data.

## Redis unavailable

```bash
docker compose stop redis
curl -i "http://localhost:4001/products?search=redis-down"
```

Expected: HTTP 200 from PostgreSQL, `X-Cache: MISS`, database-path latency, and a Catalog log containing `Redis unavailable; falling back to database`. Restart:

```bash
docker compose start redis
```

The next request can reconnect/populate Redis; a repeated request becomes a HIT.

## Order Service unavailable

```bash
docker compose stop order-service
curl -i -H "x-request-id: degraded-demo" http://localhost:4003/customers/1/summary
```

Expected: HTTP 200 containing customer data, `degraded: true`, `orderSummary.available: false`, and a warning. Customer Service remains healthy. Restart with `docker compose start order-service`.

## Catalog frontend unavailable

```bash
docker compose stop catalog-app
```

Hard-refresh `http://localhost:3000/catalog`. Expected: `Catalog is currently unavailable.` The shell dashboard and `http://localhost:3000/orders` still work. Restart with `docker compose start catalog-app`.

Stopping a frontend does not delete state. A hard refresh matters because previously downloaded browser assets can mask a stopped server.

## Slow database versus cache

Use a unique query:

```bash
curl -i "http://localhost:4001/products?search=slow-demo"
curl -i "http://localhost:4001/products?search=slow-demo"
```

The first response is MISS and includes the configured database-only delay; the second is HIT and skips it. To force the database without altering Redis, send `Cache-Control: no-cache`.

## Recovery checks

After restarting a service, inspect `docker compose ps`, its `/health` endpoint, and structured logs. The goal is not merely that a process restarts: unaffected domains must remain useful while the dependency is down.
