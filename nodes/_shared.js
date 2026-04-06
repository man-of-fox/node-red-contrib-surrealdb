"use strict";

const { getManager } = require("./_manager-registry");
const { StringRecordId } = require("surrealdb");

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
  return msg.table || nodeConfig.table || "";
}

function resolveId(nodeConfig, msg) {
  const idFromMsg = msg.recordId || msg.recordid || msg.id;
  return idFromMsg || nodeConfig.recordId || nodeConfig.recordid || "";
}

function hasRecordId(nodeConfig, msg) {
  return Boolean(resolveId(nodeConfig, msg));
}

function resolveTarget(nodeConfig, msg) {
  const recordId = resolveId(nodeConfig, msg);
  const table = resolveTable(nodeConfig, msg);

  if (!recordId) {
    if (!table) {
      return "";
    }
    return table;
  }

  const normalized = normalizeRecordId(recordId);
  if (normalized.includes(":")) {
    return normalized;
  }

  if (!table) {
    return "";
  }

  return `${table}:${normalized}`;
}

function normalizeRecordId(value) {
  if (value && typeof value === "object") {
    if (typeof value.tb === "string" && value.id !== undefined && value.id !== null) {
      return `${value.tb}:${String(value.id)}`;
    }
    return String(value.id || value);
  }
  return String(value).trim();
}

function toSdkTarget(target) {
  if (typeof target !== "string") {
    return target;
  }
  if (!target.includes(":")) {
    return target;
  }
  return new StringRecordId(target);
}

module.exports = {
  setupNodeInput,
  resolveTable,
  resolveId,
  hasRecordId,
  resolveTarget,
  toSdkTarget
};
