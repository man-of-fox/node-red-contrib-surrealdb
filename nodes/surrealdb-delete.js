"use strict";

const { setupNodeInput, resolveId, resolveTable } = require("./_shared");

module.exports = function registerSurrealDeleteNode(RED) {
  function SurrealDeleteNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for delete");
      }
      const recordId = resolveId(config, msg);
      const target = recordId ? `${table}:${recordId}` : table;
      const sql = `DELETE ${target};`;
      return manager.query(sql, {});
    });
  }

  RED.nodes.registerType("surrealdb-delete", SurrealDeleteNode);
};

