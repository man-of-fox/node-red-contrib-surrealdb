"use strict";

const { hasRecordId, setupNodeInput, resolveTarget, toSdkTarget } = require("./_shared");

module.exports = function registerSurrealModifyNode(RED) {
  function SurrealModifyNode(config) {
    RED.nodes.createNode(this, config);

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const mode = (msg.mode || config.mode || "merge").toLowerCase();
      const target = resolveTarget(config, msg);
      if (!target) {
        throw new Error("Missing table or recordId for modify");
      }
      const sdkTarget = toSdkTarget(target);
      const data = msg.payload;

      if (mode === "patch" && !hasRecordId(config, msg)) {
        throw new Error("Patch mode requires recordId");
      }

      return manager.execute((client) => {
        if (mode === "update") {
          return client.update(sdkTarget, data);
        }
        if (mode === "patch") {
          return client.patch(sdkTarget, data);
        }
        return client.merge(sdkTarget, data);
      });
    });
  }

  RED.nodes.registerType("surrealdb-modify", SurrealModifyNode);
};
