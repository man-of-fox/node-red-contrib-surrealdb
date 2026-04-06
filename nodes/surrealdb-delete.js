"use strict";

const { setupNodeInput, resolveTarget, toSdkTarget } = require("./_shared");

module.exports = function registerSurrealDeleteNode(RED) {
  function SurrealDeleteNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const target = resolveTarget(config, msg);
      if (!target) {
        throw new Error("Missing table or recordId for delete");
      }
      return manager.execute((client) => client.delete(toSdkTarget(target)));
    });
  }

  RED.nodes.registerType("surrealdb-delete", SurrealDeleteNode);
};
