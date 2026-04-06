"use strict";

const { setupNodeInput, resolveTarget, toSdkTarget } = require("./_shared");

module.exports = function registerSurrealUpsertNode(RED) {
  function SurrealUpsertNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const target = resolveTarget(config, msg);
      if (!target) {
        throw new Error("Missing table or recordId for upsert");
      }
      const data = msg.payload;
      return manager.execute((client) => client.upsert(toSdkTarget(target), data));
    });
  }

  RED.nodes.registerType("surrealdb-upsert", SurrealUpsertNode);
};
