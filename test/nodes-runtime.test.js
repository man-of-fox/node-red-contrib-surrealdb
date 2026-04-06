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

test("runtime select node: uses configured recordId from node options", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:cfg-id", name: "Config" }]
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
        recordId: "cfg-id",
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
  assert.equal(manager.calls[0].method, "select");
  assert.deepEqual(manager.calls[0].args, ["users:cfg-id"]);
});

test("runtime select node: accepts full recordId without table", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:full-id", name: "Full" }]
  });
  const selectNode = requireNodeWithSharedStub("../nodes/surrealdb-select.js", manager);

  await loadFlow(
    [selectNode],
    [
      {
        id: "n1",
        type: "surrealdb-select",
        connection: "cfg",
        table: "",
        recordId: "users:full-id",
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
  assert.equal(manager.calls[0].method, "select");
  assert.deepEqual(manager.calls[0].args, ["users:full-id"]);
});

test("runtime select node: supports recordId object from previous result", async () => {
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
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");

  const received = onceInput(out);
  inNode.receive({ recordId: { tb: "users", id: "obj-123" } });
  await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "select");
  assert.deepEqual(manager.calls[0].args, ["users:obj-123"]);
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

test("runtime modify node: merge mode by default", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:1", name: "Ada", active: true }]
  });
  const modifyNode = requireNodeWithSharedStub("../nodes/surrealdb-modify.js", manager);

  await loadFlow(
    [modifyNode],
    [
      {
        id: "n1",
        type: "surrealdb-modify",
        connection: "cfg",
        table: "users",
        recordId: "1",
        mode: "merge",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");
  const received = onceInput(out);
  inNode.receive({ payload: { active: true } });
  await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "merge");
  assert.deepEqual(manager.calls[0].args, ["users:1", { active: true }]);
});

test("runtime modify node: update mode via msg override", async () => {
  const manager = createFakeManager({
    queryResult: [{ id: "users:1", name: "Grace" }]
  });
  const modifyNode = requireNodeWithSharedStub("../nodes/surrealdb-modify.js", manager);

  await loadFlow(
    [modifyNode],
    [
      {
        id: "n1",
        type: "surrealdb-modify",
        connection: "cfg",
        table: "users",
        recordId: "1",
        mode: "merge",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");
  const received = onceInput(out);
  inNode.receive({ mode: "update", payload: { name: "Grace" } });
  await received;

  assert.equal(manager.calls.length, 1);
  assert.equal(manager.calls[0].method, "update");
  assert.deepEqual(manager.calls[0].args, ["users:1", { name: "Grace" }]);
});

test("runtime modify node: patch mode requires recordId", async () => {
  const manager = createFakeManager();
  const modifyNode = requireNodeWithSharedStub("../nodes/surrealdb-modify.js", manager);

  await loadFlow(
    [modifyNode],
    [
      {
        id: "n1",
        type: "surrealdb-modify",
        connection: "cfg",
        table: "users",
        mode: "patch",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const inNode = helper.getNode("n1");
  const errCall = onceCallEvent(inNode, "call:error");
  inNode.receive({ payload: [{ op: "replace", path: "/name", value: "New" }] });
  const call = await errCall;

  assert.ok(call, "expected call:error event");
  assert.equal(manager.calls.length, 0);
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

test("runtime live node: start registers subscription and emits ack", async () => {
  const manager = createFakeManager({
    liveHandle: { key: "live-1", subscriptionId: "sub-1" }
  });
  const liveNode = requireNodeWithSharedStub("../nodes/surrealdb-live.js", manager);

  await loadFlow(
    [liveNode],
    [
      {
        id: "n1",
        type: "surrealdb-live",
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
  const msg = await received;

  assert.equal(manager.liveCalls.length, 1);
  assert.deepEqual(manager.liveCalls[0], { action: "register", table: "users" });
  assert.equal(msg.payload.live, true);
  assert.equal(msg.payload.subscriptionId, "sub-1");
});

test("runtime live node: stop unsubscribes active subscription", async () => {
  const manager = createFakeManager({
    liveHandle: { key: "live-1", subscriptionId: "sub-1" }
  });
  const liveNode = requireNodeWithSharedStub("../nodes/surrealdb-live.js", manager);

  await loadFlow(
    [liveNode],
    [
      {
        id: "n1",
        type: "surrealdb-live",
        connection: "cfg",
        table: "users",
        wires: [["n2"]]
      },
      { id: "n2", type: "helper" }
    ]
  );

  const out = helper.getNode("n2");
  const inNode = helper.getNode("n1");

  const first = onceInput(out);
  inNode.receive({ command: "start" });
  await first;

  const second = onceInput(out);
  inNode.receive({ command: "stop" });
  const stopMsg = await second;

  assert.equal(manager.liveCalls.length, 2);
  assert.deepEqual(manager.liveCalls[1], { action: "unsubscribe", key: "live-1" });
  assert.equal(stopMsg.payload.stopped, true);
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
  const resolveTable = (nodeConfig, msg) => msg.table || nodeConfig.table || "";
  const resolveId = (nodeConfig, msg) =>
    msg.recordId || msg.recordid || msg.id || nodeConfig.recordId || nodeConfig.recordid || "";
  const resolveTarget = (nodeConfig, msg) => {
    const recordId = resolveId(nodeConfig, msg);
    const table = resolveTable(nodeConfig, msg);
    if (!recordId) {
      return table;
    }
    const normalized =
      recordId && typeof recordId === "object" && recordId.tb && recordId.id !== undefined
        ? `${recordId.tb}:${String(recordId.id)}`
        : String(recordId).trim();
    if (normalized.includes(":")) {
      return normalized;
    }
    return table ? `${table}:${normalized}` : "";
  };

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
    resolveTable,
    resolveId,
    hasRecordId(nodeConfig, msg) {
      return Boolean(resolveId(nodeConfig, msg));
    },
    resolveTarget,
    toSdkTarget(target) {
      return target;
    }
  };
}

function createFakeManager(options = {}) {
  return {
    calls: [],
    liveCalls: [],
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
        },
        update(target, data) {
          self.calls.push({ method: "update", args: [target, data] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        },
        merge(target, data) {
          self.calls.push({ method: "merge", args: [target, data] });
          if (options.executeError) {
            throw options.executeError;
          }
          return options.queryResult;
        },
        patch(target, data) {
          self.calls.push({ method: "patch", args: [target, data] });
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
    },
    async registerLive(optionsIn) {
      this.liveCalls.push({ action: "register", table: optionsIn.table });
      return options.liveHandle || { key: "live-default", subscriptionId: "sub-default" };
    },
    async unsubscribeLive(key) {
      this.liveCalls.push({ action: "unsubscribe", key });
      return true;
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
