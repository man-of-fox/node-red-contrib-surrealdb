"use strict";

const { setupNodeInput, resolveTable } = require("./_shared");

module.exports = function registerSurrealLiveNode(RED) {
  function SurrealLiveNode(config) {
    RED.nodes.createNode(this, config);
    this.subscriptionId = null;

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const command = msg.command || "start";

      if (command === "stop") {
        if (this.subscriptionId) {
          await manager.query(`KILL ${this.subscriptionId};`, {});
          this.subscriptionId = null;
        }
        return { stopped: true };
      }

      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for live query");
      }

      const sql = `LIVE SELECT * FROM ${table};`;
      const result = await manager.query(sql, {});
      const first = Array.isArray(result) ? result[0] : result;
      const liveId = extractLiveId(first);
      if (liveId) {
        this.subscriptionId = liveId;
      }
      return {
        live: true,
        subscriptionId: this.subscriptionId,
        raw: result
      };
    });

    this.on("close", async (_removed, done) => {
      this.subscriptionId = null;
      done();
    });
  }

  RED.nodes.registerType("surrealdb-live", SurrealLiveNode);
};

function extractLiveId(result) {
  if (!result || typeof result !== "object") {
    return null;
  }
  if (result.result && typeof result.result === "string") {
    return result.result;
  }
  if (typeof result.id === "string") {
    return result.id;
  }
  return null;
}

