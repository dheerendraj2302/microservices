import assert from "node:assert/strict";
import test from "node:test";

import { classifyCache, summarize } from "./benchmark.mjs";

test("classifies common cache response headers", () => {
  assert.equal(classifyCache(new Headers({ "x-cache": "HIT" })), "HIT");
  assert.equal(classifyCache(new Headers({ "x-cache": "MISS" })), "MISS");
  assert.equal(
    classifyCache(new Headers({ "cf-cache-status": "BYPASS" })),
    "BYPASS",
  );
  assert.equal(classifyCache(new Headers({ age: "12" })), "HIT");
  assert.equal(classifyCache(new Headers()), "BYPASS");
});

test("summarizes measured requests without fixed benchmark values", () => {
  const result = summarize("cache", "http://localhost/test", [
    { cacheStatus: "MISS", elapsedMilliseconds: 10, httpStatus: 200 },
    { cacheStatus: "HIT", elapsedMilliseconds: 20, httpStatus: 200 },
    { cacheStatus: "BYPASS", elapsedMilliseconds: 30, httpStatus: 200 },
  ]);

  assert.deepEqual(result.cacheCounts, { HIT: 1, MISS: 1, BYPASS: 1 });
  assert.equal(result.timingMilliseconds.average, 20);
  assert.equal(result.timingMilliseconds.p50, 20);
  assert.equal(result.timingMilliseconds.p95, 30);
  assert.equal(result.requestsPerSecond, 50);
});
