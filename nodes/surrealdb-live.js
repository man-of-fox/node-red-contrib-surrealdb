"use strict";

const { setupNodeInput, resolveTable } = require("./_shared");

module.exports = function registerSurrealLiveNode(RED) {
  function SurrealLiveNode(config) {
    RED.nodes.createNode(this, config);
    this.liveHandle = null;

    setupNodeInput(this, RED, config, async (msg, _cfg, manager) => {
      const command = msg.command || "start";

      if (command === "stop") {
        if (this.liveHandle && this.liveHandle.key) {
          await manager.unsubscribeLive(this.liveHandle.key);
          this.liveHandle = null;
        }
        this.status({ fill: "grey", shape: "ring", text: "stopped" });
        return { stopped: true };
      }

      if (this.liveHandle && this.liveHandle.key) {
        return {
          live: true,
          alreadyRunning: true,
          subscriptionId: this.liveHandle.subscriptionId || null
        };
      }

      const table = resolveTable(config, msg);
      if (!table) {
        throw new Error("Missing table for live query");
      }

      const baseMsg = RED.util.cloneMessage(msg);
      this.liveHandle = await manager.registerLive({
        table,
        onEvent: (event) => {
          const outMsg = RED.util.cloneMessage(baseMsg);
          outMsg.payload = event;
          outMsg.topic = baseMsg.topic || `surrealdb/live/${table}`;
          outMsg.subscriptionId = this.liveHandle && this.liveHandle.subscriptionId;
          this.send(outMsg);
        },
        onError: (err) => {
          this.error(err);
        }
      });

      this.status({ fill: "blue", shape: "dot", text: `live ${table}` });
      return {
        live: true,
        table,
        subscriptionId: this.liveHandle.subscriptionId || null
      };
    });

    this.on("close", async (_removed, done) => {
      try {
        if (this.liveHandle && this.liveHandle.key) {
          const cfg = RED.nodes.getNode(config.connection);
          if (cfg) {
            const { getManager } = require("./_manager-registry");
            const manager = getManager(cfg, this);
            await manager.unsubscribeLive(this.liveHandle.key);
          }
        }
        this.liveHandle = null;
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("surrealdb-live", SurrealLiveNode);
};
