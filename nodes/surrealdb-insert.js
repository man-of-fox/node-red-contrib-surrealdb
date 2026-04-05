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
      const data = msg.payload;
      const sql = `INSERT INTO ${table} CONTENT $data;`;
      return manager.query(sql, { data });
    });
  }

  RED.nodes.registerType("surrealdb-insert", SurrealInsertNode);
};
