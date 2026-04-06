"use strict";

const { setupNodeInput, resolveId, resolveTable } = require("./_shared");

module.exports = function registerSurrealModifyNode(RED) {
  function SurrealModifyNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for modify");
      }

      const mode = (msg.mode || config.mode || "merge").toLowerCase();
      const recordId = resolveId(config, msg);
      const target = recordId ? `${table}:${recordId}` : table;
      const data = msg.payload;

      if (mode === "patch" && !recordId) {
        throw new Error("Patch mode requires recordId");
      }

      return manager.execute((client) => {
        if (mode === "update") {
          return client.update(target, data);
        }
        if (mode === "patch") {
          return client.patch(target, data);
        }
        return client.merge(target, data);
      });
    });
  }

  RED.nodes.registerType("surrealdb-modify", SurrealModifyNode);
};
