"use strict";

const { setupNodeInput } = require("./_shared");

module.exports = function registerSurrealQueryNode(RED) {
  function SurrealQueryNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const query = String(msg.query || msg.sql || config.query || "").trim();
      if (!query) {
        throw new Error("Missing query for surrealdb-query");
      }

      const vars = resolveVars(config, msg);
      return manager.query(query, vars);
    });
  }

  RED.nodes.registerType("surrealdb-query", SurrealQueryNode);
};

function resolveVars(config, msg) {
  if (msg.vars && typeof msg.vars === "object") {
    return msg.vars;
  }
  if (msg.parameters && typeof msg.parameters === "object") {
    return msg.parameters;
  }
  if (config.vars && String(config.vars).trim()) {
    try {
      const parsed = JSON.parse(config.vars);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch (_err) {
      throw new Error("Invalid JSON in query vars");
    }
  }
  return {};
}
