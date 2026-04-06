"use strict";

const { setupNodeInput, resolveId, resolveTable } = require("./_shared");

module.exports = function registerSurrealSelectNode(RED) {
  function SurrealSelectNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for select");
      }
      const recordId = resolveId(config, msg);
      const target = recordId ? `${table}:${recordId}` : table;
      return manager.execute((client) => client.select(target));
    });
  }

  RED.nodes.registerType("surrealdb-select", SurrealSelectNode);
};
