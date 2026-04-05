"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const SimplePool = require("../lib/pool");

test("SimplePool initialize creates min clients", async () => {
  let created = 0;
  const destroyed = [];
  const pool = new SimplePool({
    min: 2,
    max: 3,
    create: async () => ({ id: ++created }),
    destroy: async (client) => destroyed.push(client.id)
  });

  await pool.initialize();

  assert.equal(created, 2);
  assert.equal(pool.total, 2);
  assert.equal(pool.available.length, 2);
  assert.deepEqual(destroyed, []);
});

test("SimplePool waits when max reached and resolves on release", async () => {
  let created = 0;
  const pool = new SimplePool({
    min: 0,
    max: 1,
    create: async () => ({ id: ++created }),
    destroy: async () => {}
  });

  const client = await pool.acquire();
  const waiter = pool.acquire();

  pool.release(client);
  const reused = await waiter;

  assert.equal(created, 1);
  assert.equal(reused, client);
});

test("SimplePool destroys invalid clients and creates replacement", async () => {
  let created = 0;
  const destroyed = [];
  const pool = new SimplePool({
    min: 1,
    max: 2,
    create: async () => ({ id: ++created }),
    destroy: async (client) => destroyed.push(client.id),
    validate: async (client) => client.id !== 1
  });

  await pool.initialize();
  const client = await pool.acquire();

  assert.equal(client.id, 2);
  assert.equal(created, 2);
  assert.deepEqual(destroyed, [1]);
});

test("SimplePool drain rejects waiters and destroys all clients", async () => {
  let created = 0;
  const destroyed = [];
  const pool = new SimplePool({
    min: 0,
    max: 1,
    create: async () => ({ id: ++created }),
    destroy: async (client) => destroyed.push(client.id)
  });

  const c1 = await pool.acquire();
  const waiter = pool.acquire();
  await pool.drain();

  await assert.rejects(waiter, /Pool is shutting down/);
  assert.deepEqual(destroyed, [1]);
  assert.equal(pool.total, 0);

  // Release after drain should be no-op.
  pool.release(c1);
  assert.equal(pool.available.length, 0);
});

