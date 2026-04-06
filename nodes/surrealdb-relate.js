"use strict";

const { setupNodeInput, toSdkTarget } = require("./_shared");

module.exports = function registerSurrealRelateNode(RED) {
  function SurrealRelateNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const from = resolveRecordRef(msg.from || config.from, "from");
      const relation = String(msg.relation || config.relation || "").trim();
      const to = resolveRecordRef(msg.to || config.to, "to");
      const data = msg.payload;

      if (!relation) {
        throw new Error("Missing relation for relate");
      }

      return manager.execute((client) => client.relate(from, relation, to, data));
    });
  }

  RED.nodes.registerType("surrealdb-relate", SurrealRelateNode);
};

function resolveRecordRef(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing ${label} for relate`);
  }

  if (typeof value === "object") {
    if (typeof value.tb === "string" && value.id !== undefined && value.id !== null) {
      return toSdkTarget(`${value.tb}:${String(value.id)}`);
    }
    if (typeof value.table === "string" && value.id !== undefined && value.id !== null) {
      return toSdkTarget(`${value.table}:${String(value.id)}`);
    }
    if (typeof value.id === "string" && value.id.includes(":")) {
      return toSdkTarget(value.id);
    }
    throw new Error(`Invalid ${label} for relate`);
  }

  const normalized = String(value).trim();
  if (!normalized) {
    throw new Error(`Missing ${label} for relate`);
  }

  return toSdkTarget(normalized);
}
