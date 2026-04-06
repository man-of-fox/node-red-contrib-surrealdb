"use strict";

const { setupNodeInput, resolveId, resolveTable } = require("./_shared");

module.exports = function registerSurrealUpsertNode(RED) {
  function SurrealUpsertNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for upsert");
      }
      const recordId = resolveId(config, msg);
      const target = recordId ? `${table}:${recordId}` : table;
      const data = msg.payload;
      return manager.execute((client) => client.upsert(target, data));
    });
  }

  RED.nodes.registerType("surrealdb-upsert", SurrealUpsertNode);
};
