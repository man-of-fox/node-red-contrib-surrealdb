"use strict";

const { getManager } = require("./_manager-registry");

function setupNodeInput(node, RED, config, handler) {
  node.on("input", async (msg, send, done) => {
    try {
      const cfg = RED.nodes.getNode(config.connection);
      if (!cfg) {
        throw new Error("Missing surrealdb-config node");
      }
      const manager = getManager(cfg, node);
      const result = await handler(msg, cfg, manager);
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
}

function resolveTable(nodeConfig, msg) {
  return msg.table || nodeConfig.table;
}

function resolveId(nodeConfig, msg) {
  const idFromMsg = msg.recordId || msg.id;
  return idFromMsg || nodeConfig.recordId || "";
}

module.exports = {
  setupNodeInput,
  resolveTable,
  resolveId
};

