import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIRECTORY = join(SCRIPT_DIRECTORY, "results");
const MODES = new Set(["cache", "no-cache"]);

function parseArguments(argumentsList) {
  const options = {};

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const [rawKey, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? argumentsList[++index];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawKey}`);
    }
    options[rawKey] = value;
  }

  return options;
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function percentile(sortedValues, percentileValue) {
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sortedValues.length) - 1,
  );
  return sortedValues[index];
}

function round(value) {
  return Number(value.toFixed(3));
}

function classifyCache(headers) {
  const cacheHeader = [
    headers.get("x-cache"),
    headers.get("x-cache-status"),
    headers.get("cf-cache-status"),
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (/\bHIT\b/.test(cacheHeader)) {
    return "HIT";
  }
  if (/\bMISS\b/.test(cacheHeader)) {
    return "MISS";
  }
  if (/\b(BYPASS|DYNAMIC|NO-CACHE)\b/.test(cacheHeader)) {
    return "BYPASS";
  }

  const age = Number(headers.get("age"));
  return Number.isFinite(age) && age > 0 ? "HIT" : "BYPASS";
}

async function runRequest(url, mode) {
  const headers = mode === "no-cache" ? { "Cache-Control": "no-cache" } : {};
  const startedAt = process.hrtime.bigint();
  const response = await fetch(url, { headers });
  await response.arrayBuffer();
  const elapsedMilliseconds =
    Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  if (!response.ok) {
    throw new Error(
      `Request failed with ${response.status} ${response.statusText}`,
    );
  }

  return {
    cacheStatus: classifyCache(response.headers),
    elapsedMilliseconds,
    httpStatus: response.status,
  };
}

function summarize(mode, url, requests) {
  const timings = requests
    .map(({ elapsedMilliseconds }) => elapsedMilliseconds)
    .sort((left, right) => left - right);
  const totalMilliseconds = timings.reduce((sum, value) => sum + value, 0);
  const cacheCounts = { HIT: 0, MISS: 0, BYPASS: 0 };

  for (const request of requests) {
    cacheCounts[request.cacheStatus] += 1;
  }

  return {
    mode,
    url,
    requestCount: requests.length,
    generatedAt: new Date().toISOString(),
    cacheCounts,
    timingMilliseconds: {
      average: round(totalMilliseconds / timings.length),
      minimum: round(timings[0]),
      maximum: round(timings.at(-1)),
      p50: round(percentile(timings, 50)),
      p95: round(percentile(timings, 95)),
    },
    requestsPerSecond: round(
      requests.length / (totalMilliseconds / 1_000),
    ),
    requests: requests.map((request, index) => ({
      sequence: index + 1,
      httpStatus: request.httpStatus,
      cacheStatus: request.cacheStatus,
      elapsedMilliseconds: round(request.elapsedMilliseconds),
    })),
  };
}

function printResult(result) {
  const timing = result.timingMilliseconds;
  console.log(`\n${result.mode.toUpperCase()} — ${result.url}`);
  console.log(`Requests: ${result.requestCount}`);
  console.log(
    `Cache: HIT ${result.cacheCounts.HIT} | MISS ${result.cacheCounts.MISS} | BYPASS ${result.cacheCounts.BYPASS}`,
  );
  console.log(
    `Timing (ms): avg ${timing.average} | min ${timing.minimum} | max ${timing.maximum} | P50 ${timing.p50} | P95 ${timing.p95}`,
  );
  console.log(`RPS: ${result.requestsPerSecond}`);
}

async function readResult(mode) {
  try {
    return JSON.parse(
      await readFile(join(RESULTS_DIRECTORY, `${mode}.json`), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function printComparison(noCache, cache) {
  const averageDifference =
    noCache.timingMilliseconds.average -
    cache.timingMilliseconds.average;
  const p95Difference =
    noCache.timingMilliseconds.p95 - cache.timingMilliseconds.p95;
  const rpsDifference =
    cache.requestsPerSecond - noCache.requestsPerSecond;

  console.log("\nPERFORMANCE COMPARISON");
  console.log("                     No Cache       Redis Cache");
  console.log(`Average (ms)         ${String(noCache.timingMilliseconds.average).padEnd(15)}${cache.timingMilliseconds.average}`);
  console.log(`P50 (ms)             ${String(noCache.timingMilliseconds.p50).padEnd(15)}${cache.timingMilliseconds.p50}`);
  console.log(`P95 (ms)             ${String(noCache.timingMilliseconds.p95).padEnd(15)}${cache.timingMilliseconds.p95}`);
  console.log(`Requests/sec         ${String(noCache.requestsPerSecond).padEnd(15)}${cache.requestsPerSecond}`);
  console.log("\nDELTA (Redis cache compared with no-cache)");
  console.log(
    `Average latency change: ${round(-averageDifference)} ms | P95 latency change: ${round(-p95Difference)} ms | RPS change: ${round(rpsDifference)}`,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const mode = options.mode ?? "cache";
  const url =
    options.url ??
    process.env.BENCHMARK_URL ??
    "http://localhost:4001/products";
  const requestCount = positiveInteger(
    options.requests ?? process.env.BENCHMARK_REQUESTS ?? "30",
    "Request count",
  );

  if (!MODES.has(mode)) {
    throw new Error("Mode must be either cache or no-cache");
  }

  const measuredUrl = new URL(url);
  if (!measuredUrl.searchParams.has("search")) {
    measuredUrl.searchParams.set("search", `benchmark-${Date.now()}`);
  }
  const requests = [];
  for (let sequence = 1; sequence <= requestCount; sequence += 1) {
    requests.push(await runRequest(measuredUrl.toString(), mode));
  }

  const result = summarize(mode, measuredUrl.toString(), requests);
  await mkdir(RESULTS_DIRECTORY, { recursive: true });
  const resultPath = join(RESULTS_DIRECTORY, `${mode}.json`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  printResult(result);
  console.log(`Saved: ${resultPath}`);

  const [noCacheResult, cacheResult] = await Promise.all([
    readResult("no-cache"),
    readResult("cache"),
  ]);
  if (noCacheResult && cacheResult) {
    printComparison(noCacheResult, cacheResult);
  }
}

export { classifyCache, summarize };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
