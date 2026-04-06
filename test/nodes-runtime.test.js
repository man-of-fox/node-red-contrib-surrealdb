"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const helper = require("node-red-node-test-helper");
helper.init(require.resolve("node-red"));

const originalLoad = Module._load;

test.before(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

test.afterEach(async () => {
  await unload();
});

test("runtime insert node: sends query result to output", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:1", name: "Ada" }]
  });
  const insertNode = requireNodeWithSharedStub("../nodes/surrealdb-insert.js", manager);

  await loadFlow(
    [insertNode],
    [
      {
        id: "n1",
        type: "surrealdb-insert",
        connection: "cfg",
        table: "users",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");

  const received = onceInput(out);
  inNode.receive({ payload: { name: "Ada" } });
  const msg = await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "insert");
  assert.deepEqual(manager.calls[0].args, ["users", { name: "Ada" }]);
  assert.deepEqual(msg.payload, [{ id: "users:1", name: "Ada" }]);
});

test("runtime select node: uses msg.recordId override", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:2", name: "Grace" }]
  });
  const selectNode = requireNodeWithSharedStub("../nodes/surrealdb-select.js", manager);

  await loadFlow(
    [selectNode],
    [
      {
        id: "n1",
        type: "surrealdb-select",
        connection: "cfg",
        table: "users",
        recordId: "from-config",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");

  const received = onceInput(out);
  inNode.receive({ recordId: "from-msg" });
  await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "select");
  assert.deepEqual(manager.calls[0].args, ["users:from-msg"]);
});

test("runtime delete node: deletes whole table when no record id provided", async () => {
  const manager = createFakeManager({
    queryResult: [{ ok: true }]
  });
  const deleteNode = requireNodeWithSharedStub("../nodes/surrealdb-delete.js", manager);

  await loadFlow(
    [deleteNode],
    [
      {
        id: "n1",
        type: "surrealdb-delete",
        connection: "cfg",
        table: "users",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");

  const received = onceInput(out);
  inNode.receive({});
  await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "delete");
  assert.deepEqual(manager.calls[0].args, ["users"]);
});

test("runtime insert node: emits error when table is missing", async () => {
  const manager = createFakeManager();
  const insertNode = requireNodeWithSharedStub("../nodes/surrealdb-insert.js", manager);

  await loadFlow(
    [insertNode],
    [
      {
        id: "n1",
        type: "surrealdb-insert",
        connection: "cfg",
        table: "",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const inNode = helper.getNode("n1");
  const errCall = onceCallEvent(inNode, "call:error");

  inNode.receive({ payload: { name: "Ada" } });
  const call = await errCall;

  assert.ok(call, "expected call:error event");
  assert.equal(manager.calls.length, 0);
});

test("runtime select node: emits error when config node is missing", async () => {
  const manager = createFakeManager();
  const selectNode = requireNodeWithSharedStub("../nodes/surrealdb-select.js", manager);

  await loadFlow(
    [selectNode],
    [
      {
        id: "n1",
        type: "surrealdb-select",
        connection: "missing-cfg",
        table: "users",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const inNode = helper.getNode("n1");
  const errCall = onceCallEvent(inNode, "call:error");

  inNode.receive({});
  const call = await errCall;

  assert.ok(call, "expected call:error event");
  assert.equal(manager.calls.length, 0);
});

function requireNodeWithSharedStub(nodeModulePath, manager) {
  const nodePath = require.resolve(nodeModulePath);
  delete require.cache[nodePath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "./_shared" && parent && parent.filename === nodePath) {
      return createSharedStub(manager);
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(nodeModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

function createSharedStub(manager) {
  return {
    setupNodeInput(node, _RED, config, handler) {
      node.on("input", async (msg, send, done) => {
        try {
          if (!config.connection || config.connection === "missing-cfg") {
            throw new Error("Missing surrealdb-config node");
          }
          const result = await handler(msg, { id: config.connection }, manager);
          if (result !== undefined) {
            msg.payload = result;
          }
          send(msg);
          done();
        } catch (err) {
          node.error(err, msg);
          done(err);
        }
      });
    },
    resolveTable(nodeConfig, msg) {
      return msg.table || nodeConfig.table;
    },
    resolveId(nodeConfig, msg) {
      return msg.recordId || msg.id || nodeConfig.recordId || "";
    }
  };
}

function createFakeManager(options = {}) {
  return {
    calls: [],
    async execute(operationFn) {
      const self = this;
      const fakeClient = {
        insert(table, data) {
          self.calls.push({ method: "insert", args: [table, data] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        },
        select(target) {
          self.calls.push({ method: "select", args: [target] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        },
        delete(target) {
          self.calls.push({ method: "delete", args: [target] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        },
        upsert(target, data) {
          self.calls.push({ method: "upsert", args: [target, data] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        }
      };
      try {
        return await operationFn(fakeClient);
      } catch (err) {
        throw err;
      }
    }
  };
}

function onceInput(node) {
  return new Promise((resolve) => {
    node.once("input", (msg) => resolve(msg));
  });
}

function onceCallEvent(node, eventName) {
  return new Promise((resolve) => {
    node.once(eventName, (call) => resolve(call));
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    helper.startServer((err) => (err ? reject(err) : resolve()));
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    helper.stopServer((err) => (err ? reject(err) : resolve()));
  });
}

function unload() {
  return helper.unload();
}

function loadFlow(nodes, flow) {
  return new Promise((resolve, reject) => {
    helper.load(nodes, flow, (err) => (err ? reject(err) : resolve()));
  });
}
