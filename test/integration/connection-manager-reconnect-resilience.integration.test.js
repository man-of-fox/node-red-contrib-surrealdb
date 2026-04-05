"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Surreal } = require("surrealdb");
const ConnectionManager = require("../../lib/connection-manager");

const DB_CONFIG = {
  url: process.env.SURREALDB_URL || "ws://127.0.0.1:8000/rpc",
  namespace: process.env.SURREALDB_NS || "test",
  database: process.env.SURREALDB_DB || "test",
  username: process.env.SURREALDB_USER || "",
  password: process.env.SURREALDB_PASS || "",
  authType: "credentials",
  minConnections: 1,
  maxConnections: 2,
  retryAttempts: 2,
  retryDelayMs: 250,
  validateConnection: true,
  healthCheckIntervalMs: 0
};

test.before(async () => {
  await waitForDatabase(DB_CONFIG, 60000);
});

test("Resilience unauth: dead connection is replaced and subsequent query succeeds", async () => {
  const manager = new ConnectionManager(DB_CONFIG);
  try {
    await manager.start();
    assert.equal(firstResult(await manager.query("RETURN 21;")), 21);

    const deadClient = await manager.pool.acquire();
    await deadClient.close();
    manager.pool.release(deadClient);

    const recovered = await retry(async () => firstResult(await manager.query("RETURN 23;")), {
      attempts: 8,
      delayMs: 250
    });
    assert.equal(recovered, 23);
  } finally {
    await manager.stop();
  }
});

async function waitForDatabase(config, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const client = new Surreal();
    try {
      await client.connect(config.url);
      await useDb(client, config.namespace, config.database);
      await client.ping();
      await client.close();
      return;
    } catch (err) {
      lastError = err;
      try {
        await client.close();
      } catch (_err) {
        // ignore close errors while polling startup
      }
      await sleep(1000);
    }
  }

  throw new Error(
    `SurrealDB did not become ready within ${timeoutMs}ms: ${String(
      (lastError && lastError.message) || "unknown"
    )}`
  );
}

async function useDb(client, namespace, database) {
  try {
    await client.use({ namespace, database });
  } catch (_err) {
    await client.use(namespace, database);
  }
}

function firstResult(value) {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (
      first &&
      typeof first === "object" &&
      Object.prototype.hasOwnProperty.call(first, "result")
    ) {
      const result = first.result;
      return Array.isArray(result) ? result[0] : result;
    }
    return first;
  }
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    const result = value.result;
    return Array.isArray(result) ? result[0] : result;
  }
  return value;
}

async function retry(fn, options) {
  const attempts = options.attempts || 5;
  const delayMs = options.delayMs || 200;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await sleep(delayMs);
    }
  }
  throw lastError || new Error("Retry failed");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
