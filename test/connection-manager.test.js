"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "surrealdb") {
    return { Surreal: class SurrealMock {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const ConnectionManager = require("../lib/connection-manager");
Module._load = originalLoad;

test("ConnectionManager.execute retries once after auth error and refresh success", async () => {
  const manager = new ConnectionManager({ url: "ws://unused" });
  const fakeClient = { id: "c1" };

  let acquireCalled = 0;
  const releaseCalls = [];
  manager.start = async () => {};
  manager.pool = {
    acquire: async () => {
      acquireCalled += 1;
      return fakeClient;
    },
    release: (client) => releaseCalls.push(client),
    destroyClient: async () => {
      throw new Error("destroyClient should not be called for auth error");
    }
  };
  manager._isAuthError = () => true;
  manager._isConnectionError = () => false;
  manager._tryRefreshToken = async () => true;

  let opCalls = 0;
  const result = await manager.execute(async () => {
    opCalls += 1;
    if (opCalls === 1) {
      throw new Error("token invalid");
    }
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(opCalls, 2);
  assert.equal(acquireCalled, 1);
  assert.equal(releaseCalls.length, 1);
  assert.equal(releaseCalls[0], fakeClient);
});

test("ConnectionManager.execute destroys client on connection error", async () => {
  const manager = new ConnectionManager({ url: "ws://unused" });
  const fakeClient = { id: "c2" };

  let destroyed = false;
  manager.start = async () => {};
  manager.pool = {
    acquire: async () => fakeClient,
    release: () => {},
    destroyClient: async (client) => {
      destroyed = client === fakeClient;
    }
  };
  manager._isAuthError = () => false;
  manager._isConnectionError = () => true;

  await assert.rejects(
    manager.execute(async () => {
      throw new Error("connection closed");
    }),
    /connection closed/
  );

  assert.equal(destroyed, true);
});

test("ConnectionManager.execute times out operation and destroys client", async () => {
  const manager = new ConnectionManager({
    url: "ws://unused",
    operationTimeoutMs: 10
  });
  const fakeClient = { id: "c-timeout" };

  let destroyed = false;
  manager.start = async () => {};
  manager.pool = {
    acquire: async () => fakeClient,
    release: () => {},
    destroyClient: async (client) => {
      destroyed = client === fakeClient;
    }
  };

  await assert.rejects(
    manager.execute(
      async () =>
        new Promise(() => {
          // never resolves
        })
    ),
    /timed out/
  );

  assert.equal(destroyed, true);
});

test("ConnectionManager.query delegates to execute with default vars", async () => {
  const manager = new ConnectionManager({ url: "ws://unused" });
  const calls = [];

  manager.execute = async (operationFn) => {
    const client = {
      query: async (sql, vars) => {
        calls.push({ sql, vars });
        return [{ ok: true }];
      }
    };
    return operationFn(client);
  };

  const result = await manager.query("SELECT * FROM foo;");

  assert.deepEqual(result, [{ ok: true }]);
  assert.deepEqual(calls, [{ sql: "SELECT * FROM foo;", vars: {} }]);
});

test("ConnectionManager.stop drains pool and sets state", async () => {
  const status = [];
  const manager = new ConnectionManager({ url: "ws://unused" }, null, (state, text) => {
    status.push({ state, text });
  });

  let drained = false;
  manager.pool = {
    drain: async () => {
      drained = true;
    }
  };
  manager.healthTimer = setInterval(() => {}, 1000);
  manager.tokenTimer = setInterval(() => {}, 1000);

  await manager.stop();

  assert.equal(drained, true);
  assert.equal(manager.pool, null);
  assert.equal(manager.state, "disconnected");
  assert.equal(manager.healthTimer, null);
  assert.equal(manager.tokenTimer, null);
  assert.deepEqual(status[status.length - 1], { state: "disconnected", text: "disconnected" });
});
