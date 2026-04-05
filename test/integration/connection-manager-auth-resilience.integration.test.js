"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Surreal } = require("surrealdb");
const ConnectionManager = require("../../lib/connection-manager");

const AUTH_DB_CONFIG = {
  url: process.env.SURREALDB_AUTH_URL || "ws://127.0.0.1:8001/rpc",
  namespace: process.env.SURREALDB_AUTH_NS || "test",
  database: process.env.SURREALDB_AUTH_DB || "test",
  username: process.env.SURREALDB_AUTH_USER || "root",
  password: process.env.SURREALDB_AUTH_PASS || "root",
  authType: "credentials",
  minConnections: 1,
  maxConnections: 2,
  retryAttempts: 2,
  retryDelayMs: 250,
  validateConnection: true,
  healthCheckIntervalMs: 0
};

test.before(async () => {
  await waitForAuthDatabase(AUTH_DB_CONFIG, 60000);
});

test("Resilience auth: token watcher refreshes expired token", async () => {
  const manager = new ConnectionManager(AUTH_DB_CONFIG);
  try {
    await manager.start();

    const expiredToken = makeJwt({ exp: Math.floor(Date.now() / 1000) - 30 });
    manager.tokenManager.setToken(expiredToken);

    await waitFor(
      () => manager.tokenManager.getToken() && manager.tokenManager.getToken() !== expiredToken,
      12000
    );

    const result = await manager.query("RETURN 11;");
    assert.equal(firstResult(result), 11);
  } finally {
    await manager.stop();
  }
});

async function waitForAuthDatabase(config, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const client = new Surreal();
    try {
      await client.connect(config.url);
      await client.signin({
        username: config.username,
        password: config.password
      });
      await client.use({ namespace: config.namespace, database: config.database });
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
    `Authenticated SurrealDB did not become ready within ${timeoutMs}ms: ${String(
      (lastError && lastError.message) || "unknown"
    )}`
  );
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

function makeJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.sig`;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Condition did not become true within ${timeoutMs}ms`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
