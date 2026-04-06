"use strict";

const { setupNodeInput, resolveTarget, toSdkTarget } = require("./_shared");

module.exports = function registerSurrealSelectNode(RED) {
  function SurrealSelectNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const target = resolveTarget(config, msg);
      if (!target) {
        throw new Error("Missing table or recordId for select");
      }
      return manager.execute((client) => client.select(toSdkTarget(target)));
    });
  }

  RED.nodes.registerType("surrealdb-select", SurrealSelectNode);
};
