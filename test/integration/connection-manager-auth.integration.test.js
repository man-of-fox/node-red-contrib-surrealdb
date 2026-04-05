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
  await waitForDatabase(AUTH_DB_CONFIG, 60000);
});

test("Auth integration: credentials mode can execute queries", async () => {
  const manager = new ConnectionManager(AUTH_DB_CONFIG);
  try {
    const result = await manager.query("RETURN 2;");
    assert.equal(firstResult(result), 2);
  } finally {
    await manager.stop();
  }
});

test("Auth integration: wrong credentials fail to connect", async () => {
  const manager = new ConnectionManager({
    ...AUTH_DB_CONFIG,
    password: "wrong-password"
  });

  await assert.rejects(() => manager.start());
  await manager.stop();
});

test("Auth integration: token mode can authenticate and query", async () => {
  const token = await issueToken(AUTH_DB_CONFIG);
  assert.ok(token, "expected token from signin");

  const manager = new ConnectionManager({
    ...AUTH_DB_CONFIG,
    authType: "token",
    token,
    username: "",
    password: ""
  });

  try {
    const result = await manager.query("RETURN 3;");
    assert.equal(firstResult(result), 3);
  } finally {
    await manager.stop();
  }
});

async function issueToken(config) {
  const client = new Surreal();
  try {
    await client.connect(config.url);
    const token = await client.signin({
      username: config.username,
      password: config.password
    });
    return token;
  } finally {
    await client.close();
  }
}

async function waitForDatabase(config, timeoutMs) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
