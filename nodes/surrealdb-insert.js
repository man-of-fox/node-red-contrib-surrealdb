"use strict";

const { setupNodeInput, resolveTable, toSdkTarget } = require("./_shared");

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
          return client.create(toSdkTarget(table)).content(data);
        }
        return client.insert(toSdkTarget(table), data);
      });
    });
  }

  RED.nodes.registerType("surrealdb-insert", SurrealInsertNode);
};
