# Performance

## What is intentionally slow?

Every Catalog database read waits for `CATALOG_DB_DEMO_DELAY_MS` (700 ms by default) before querying PostgreSQL. The delay models an expensive downstream/database operation and occurs only on MISS/BYPASS paths. Redis hits do not sleep. HTTP and benchmark timings are real; no fake result is returned.

## Benchmark method

```bash
npm run benchmark:no-cache
npm run benchmark:cache
```

The no-cache mode sends `Cache-Control: no-cache`, so all requests use PostgreSQL. Cache mode repeatedly uses one unique valid search query, producing a cold MISS followed by HITs. The default is 30 sequential requests; set `BENCHMARK_REQUESTS` and `BENCHMARK_URL` if needed.

The script uses `process.hrtime.bigint()` and reports:

- request count and HIT/MISS/BYPASS counts
- average, minimum, and maximum latency
- nearest-rank P50 and P95 latency
- requests per second

Each mode writes its measured JSON result to `scripts/performance/results`. When both files exist, the second command prints a side-by-side `PERFORMANCE COMPARISON`. Values vary by machine and are intentionally absent from source documentation.

## Why caching improves it

The first cache-mode call still pays the database/delay cost and stores the serialized result with TTL. Subsequent identical calls perform one Redis lookup and JSON parse. This removes repeated simulated database cost, so median/P95 and throughput should visibly improve.

## Other backend optimizations

- PostgreSQL pools reuse bounded connections.
- GIN trigram search and category/customer/date/order indexes support actual query shapes.
- Parameterized SQL and selected columns avoid unsafe/dynamic values and unnecessary transfer.
- Lists have maximum page sizes.
- Order creation uses one transaction.
- Fastify/Node use non-blocking I/O; compression is available for useful payload sizes.
- Customer's downstream request is bounded by `AbortController`.

## Frontend optimizations

- Multi-Zone route boundaries prevent the shell from downloading Catalog and Orders initially.
- Each Next.js build performs code splitting.
- Search waits 300 ms after typing; stale fetches receive an abort signal.
- TanStack Query deduplicates requests and uses explicit stale windows.
- Pagination bounds DOM and payload size.
- Skeleton, empty, retry, and degraded states keep latency/failure understandable.

## Trade-offs

The artificial delay is a demonstration control, not a claim that PostgreSQL normally takes 700 ms. Sequential requests make individual latency and cache state easy to explain; a separate concurrent load test would be needed to characterize saturation, pool contention, and tail behavior. A cache benchmark also does not prove end-to-end user experience by itself, so browser network/code-loading evidence is shown separately.
