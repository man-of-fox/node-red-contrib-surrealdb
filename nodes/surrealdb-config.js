"use strict";

const { closeManager } = require("./_manager-registry");

module.exports = function registerSurrealConfigNode(RED) {
  function SurrealConfigNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.url = config.url;
    this.namespace = config.namespace;
    this.database = config.database;
    this.authType = config.authType || "credentials";
    this.username = config.username;
    this.password = this.credentials && this.credentials.password;
    this.token = this.credentials && this.credentials.token;
    this.minConnections = Number(config.minConnections || 1);
    this.maxConnections = Number(config.maxConnections || 5);
    this.healthCheckIntervalMs = Number(config.healthCheckIntervalMs || 30000);
    this.healthCheckTimeoutMs = Number(config.healthCheckTimeoutMs || 2000);
    this.retryAttempts = Number(config.retryAttempts || 5);
    this.retryDelayMs = Number(config.retryDelayMs || 1000);
    this.acquireTimeoutMs = Number(config.acquireTimeoutMs || 30000);
    this.operationTimeoutMs = Number(config.operationTimeoutMs || 30000);
    this.validateConnection = !(
      config.validateConnection === false ||
      config.validateConnection === "false" ||
      config.validateConnection === 0 ||
      config.validateConnection === "0"
    );
    this.tokenRefreshSkewSec = Number(config.tokenRefreshSkewSec || 60);

    this.connectionOptions = () => ({
      url: this.url,
      namespace: this.namespace,
      database: this.database,
      authType: this.authType,
      username: this.username,
      password: this.password,
      token: this.token,
      minConnections: this.minConnections,
      maxConnections: this.maxConnections,
      healthCheckIntervalMs: this.healthCheckIntervalMs,
      healthCheckTimeoutMs: this.healthCheckTimeoutMs,
      retryAttempts: this.retryAttempts,
      retryDelayMs: this.retryDelayMs,
      acquireTimeoutMs: this.acquireTimeoutMs,
      operationTimeoutMs: this.operationTimeoutMs,
      validateConnection: this.validateConnection,
      tokenRefreshSkewSec: this.tokenRefreshSkewSec
    });

    this.on("close", async (_removed, done) => {
      try {
        await closeManager(this.id);
        done();
      } catch (err) {
        done(err);
      }
    });
  }

  RED.nodes.registerType("surrealdb-config", SurrealConfigNode, {
    credentials: {
      password: { type: "password" },
      token: { type: "password" }
    }
  });
};
