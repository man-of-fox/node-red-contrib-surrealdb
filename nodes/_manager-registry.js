"use strict";

const ConnectionManager = require("../lib/connection-manager");

const managers = new Map();

function getManager(configNode, node) {
  const key = configNode.id;
  const existing = managers.get(key);
  if (existing) {
    return existing;
  }

  const manager = new ConnectionManager(configNode.connectionOptions(), node, (state, text) => {
    const isWarning = state === "reconnecting" || state === "connecting";
    const fill = state === "connected" ? "green" : isWarning ? "yellow" : "red";
    node.status({ fill, shape: "dot", text });
  });

  managers.set(key, manager);
  return manager;
}

async function closeManager(configNodeId) {
  const manager = managers.get(configNodeId);
  if (!manager) {
    return;
  }
  await manager.stop();
  managers.delete(configNodeId);
}

module.exports = {
  getManager,
  closeManager
};
