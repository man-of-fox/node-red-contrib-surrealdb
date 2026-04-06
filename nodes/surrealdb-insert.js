"use strict";

const { setupNodeInput, resolveTable } = require("./_shared");

module.exports = function registerSurrealInsertNode(RED) {
  function SurrealInsertNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for insert");
      }
      const mode = String(msg.mode || config.mode || "insert").toLowerCase();
      const data = msg.payload;
      return manager.execute((client) => {
        if (mode === "create") {
          return client.create(table, data);
        }
        return client.insert(table, data);
      });
    });
  }

  RED.nodes.registerType("surrealdb-insert", SurrealInsertNode);
};
