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

let manager;

test.before(async () => {
  await waitForDatabase(DB_CONFIG, 60000);
  manager = new ConnectionManager(DB_CONFIG);
});

test.after(async () => {
  if (manager) {
    await manager.stop();
  }
});

test("ConnectionManager integration: create/select/upsert/delete lifecycle", async () => {
  const table = `it_items_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;

  const created = await manager.execute((client) =>
    client.create(table, { name: "alpha", count: 1 })
  );
  const createdRow = firstRow(created);
  assert.ok(createdRow, "expected created row");

  const recordId = createdRow.id;
  assert.ok(recordId, "expected a record id");

  const selected = await manager.execute((client) => client.select(recordId));
  const selectedRow = firstRow(selected);
  assert.equal(selectedRow.name, "alpha");
  assert.equal(selectedRow.count, 1);

  await manager.execute((client) => client.upsert(recordId, { name: "beta", count: 2 }));
  const updated = await manager.execute((client) => client.select(recordId));
  const updatedRow = firstRow(updated);
  assert.equal(updatedRow.name, "beta");
  assert.equal(updatedRow.count, 2);

  await manager.execute((client) => client.delete(recordId));
  const deleted = await manager.execute((client) => client.select(recordId));
  assert.ok(
    deleted === undefined || deleted === null || (Array.isArray(deleted) && deleted.length === 0)
  );
});

test("ConnectionManager integration: query path executes SQL", async () => {
  const result = await manager.query("RETURN 1;");
  const scalar = firstResult(result);
  assert.equal(scalar, 1);
});

async function waitForDatabase(config, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const client = new Surreal();
    try {
      await client.connect(config.url);
      if (config.username && config.password) {
        await client.signin({
          namespace: config.namespace,
          database: config.database,
          username: config.username,
          password: config.password,
          user: config.username,
          pass: config.password
        });
      }
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

function firstRow(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
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
