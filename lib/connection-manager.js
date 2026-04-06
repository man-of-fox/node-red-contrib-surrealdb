"use strict";

const { Surreal } = require("surrealdb");
const SimplePool = require("./pool");
const TokenManager = require("./token-manager");

const DEFAULTS = {
  retryAttempts: 5,
  retryDelayMs: 1000,
  minConnections: 1,
  maxConnections: 5,
  healthCheckIntervalMs: 30000,
  validateConnection: true,
  tokenRefreshSkewSec: 60
};

class ConnectionManager {
  constructor(config, logger, statusCallback) {
    this.config = { ...DEFAULTS, ...config };
    this.logger = logger || console;
    this.statusCallback = statusCallback || (() => {});

    this.state = "disconnected";
    this.pool = null;
    this.healthTimer = null;
    this.tokenTimer = null;
    this.tokenManager = new TokenManager({ skewSeconds: this.config.tokenRefreshSkewSec });
    this.liveSubscriptions = new Map();
    this.liveSequence = 0;
    this.liveRecoveryRunning = false;
  }

  async start() {
    if (this.pool) {
      return;
    }

    this.state = "connecting";
    this.statusCallback(this.state, "connecting");

    this.pool = new SimplePool({
      min: this.config.minConnections,
      max: this.config.maxConnections,
      create: () => this._connectWithRetry(),
      destroy: (client) => this._closeClient(client),
      validate: this.config.validateConnection ? (client) => this._validateClient(client) : null
    });

    await this.pool.initialize();
    this.state = "connected";
    this.statusCallback(this.state, "connected");
    this._startHealthChecks();
    this._startTokenWatcher();
  }

  async execute(operationFn) {
    await this.start();
    const client = await this.pool.acquire();

    try {
      return await operationFn(client);
    } catch (err) {
      if (this._isAuthError(err) && (await this._tryRefreshToken(client))) {
        return operationFn(client);
      }
      if (this._isConnectionError(err)) {
        await this.pool.destroyClient(client);
      }
      throw err;
    } finally {
      this.pool.release(client);
    }
  }

  async query(sql, vars) {
    return this.execute((client) => client.query(sql, vars || {}));
  }

  async registerLive(options) {
    await this.start();

    const table = options && options.table;
    const onEvent = options && options.onEvent;
    const onError = (options && options.onError) || (() => {});
    if (!table) {
      throw new Error("Missing table for live query");
    }
    if (typeof onEvent !== "function") {
      throw new Error("Missing onEvent callback for live query");
    }

    const key = `live-${++this.liveSequence}`;
    const subscription = {
      key,
      table,
      sql: `LIVE SELECT * FROM ${table};`,
      onEvent,
      onError,
      client: null,
      subscriptionId: null,
      active: true
    };
    this.liveSubscriptions.set(key, subscription);

    try {
      await this._activateLiveSubscription(subscription);
      return {
        key,
        table: subscription.table,
        subscriptionId: subscription.subscriptionId
      };
    } catch (err) {
      this.liveSubscriptions.delete(key);
      throw err;
    }
  }

  async unsubscribeLive(key) {
    const subscription = this.liveSubscriptions.get(key);
    if (!subscription) {
      return false;
    }
    subscription.active = false;
    await this._deactivateLiveSubscription(subscription);
    this.liveSubscriptions.delete(key);
    return true;
  }

  async stop() {
    this._stopTimers();
    await this._unsubscribeAllLive();
    if (this.pool) {
      await this.pool.drain();
      this.pool = null;
    }
    this.state = "disconnected";
    this.statusCallback(this.state, "disconnected");
  }

  async _connectWithRetry() {
    let attempt = 0;
    const max = Number(this.config.retryAttempts);
    const baseDelay = Number(this.config.retryDelayMs);

    while (attempt <= max) {
      attempt += 1;
      let client = null;
      try {
        client = new Surreal();
        await client.connect(this.config.url);
        await this._authenticate(client);
        await this._useDatabase(client);
        return client;
      } catch (err) {
        if (client && typeof client.close === "function") {
          try {
            await client.close();
          } catch (_closeErr) {
            // ignore close errors during reconnect attempts
          }
        }
        if (attempt > max) {
          this.state = "disconnected";
          this.statusCallback(this.state, "connect failed");
          throw err;
        }
        this.state = "reconnecting";
        this.statusCallback(this.state, `retry ${attempt}/${max}`);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(baseDelay * attempt + jitter);
      }
    }

    throw new Error("Unable to connect to SurrealDB");
  }

  async _authenticate(client) {
    const authType = this.config.authType || "credentials";

    if (authType === "token" && this.config.token) {
      this.tokenManager.setToken(this.config.token);
      if (typeof client.authenticate === "function") {
        await client.authenticate(this.config.token);
      }
      return;
    }

    if (this.config.username && this.config.password && typeof client.signin === "function") {
      const signinResult = await this._signin(client);

      const token = typeof signinResult === "string" ? signinResult : null;
      if (token) {
        this.tokenManager.setToken(token);
      }
    }
  }

  async _useDatabase(client) {
    const namespace = this.config.namespace;
    const database = this.config.database;

    if (!namespace || !database) {
      return;
    }

    if (typeof client.use === "function") {
      try {
        await client.use({ namespace, database });
        return;
      } catch (_err) {
        await client.use(namespace, database);
      }
    }
  }

  async _validateClient(client) {
    try {
      await client.query("RETURN true;");
      return true;
    } catch (_err) {
      return false;
    }
  }

  async _closeClient(client) {
    if (!client) {
      return;
    }
    if (typeof client.close === "function") {
      await client.close();
    }
  }

  _startHealthChecks() {
    this._clearHealthTimer();
    const interval = Number(this.config.healthCheckIntervalMs);
    if (!interval || interval <= 0) {
      return;
    }

    this.healthTimer = setInterval(async () => {
      try {
        if (!this.pool) {
          return;
        }
        const client = await this.pool.acquire();
        try {
          await this._validateClient(client);
        } finally {
          this.pool.release(client);
        }
      } catch (err) {
        this.logger.warn("SurrealDB health check failed", err);
        await this._recoverLiveSubscriptions();
      }
    }, interval);
  }

  _startTokenWatcher() {
    this._clearTokenTimer();
    this.tokenTimer = setInterval(async () => {
      if (!this.tokenManager.shouldRefresh()) {
        return;
      }
      try {
        await this.execute((client) => this._refreshToken(client));
      } catch (err) {
        this.logger.warn("SurrealDB token refresh failed", err);
      }
    }, 5000);
  }

  async _tryRefreshToken(client) {
    try {
      await this._refreshToken(client);
      return true;
    } catch (_err) {
      return false;
    }
  }

  async _refreshToken(client) {
    this.statusCallback("connecting", "refreshing token");
    const authType = this.config.authType || "credentials";

    if (authType === "token" && this.config.token) {
      if (typeof client.authenticate === "function") {
        await client.authenticate(this.config.token);
      }
      this.tokenManager.setToken(this.config.token);
      this.statusCallback("connected", "token refreshed");
      return;
    }

    if (typeof client.signin !== "function") {
      throw new Error("No signin method available for refresh");
    }

    const result = await this._signin(client);

    const token = typeof result === "string" ? result : null;
    if (token) {
      this.tokenManager.setToken(token);
    }
    this.statusCallback("connected", "token refreshed");
  }

  _isConnectionError(err) {
    const msg = String((err && err.message) || "").toLowerCase();
    return (
      msg.includes("socket") ||
      msg.includes("connection") ||
      msg.includes("network") ||
      msg.includes("closed")
    );
  }

  _isAuthError(err) {
    const msg = String((err && err.message) || "").toLowerCase();
    return msg.includes("token") || msg.includes("auth") || msg.includes("unauthorized");
  }

  _stopTimers() {
    this._clearHealthTimer();
    this._clearTokenTimer();
  }

  _clearHealthTimer() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  _clearTokenTimer() {
    if (this.tokenTimer) {
      clearInterval(this.tokenTimer);
      this.tokenTimer = null;
    }
  }

  async _activateLiveSubscription(subscription) {
    const client = await this._connectWithRetry();

    try {
      const liveResult = await client.query(subscription.sql, {});
      const liveId = extractLiveId(liveResult);
      if (!liveId) {
        throw new Error("Unable to extract live subscription id");
      }
      if (typeof client.subscribeLive !== "function") {
        throw new Error("SurrealDB client does not support subscribeLive");
      }

      await client.subscribeLive(liveId, (...args) => {
        if (!subscription.active) {
          return;
        }
        try {
          subscription.onEvent(normalizeLiveEvent(liveId, args));
        } catch (err) {
          subscription.onError(err);
        }
      });

      subscription.client = client;
      subscription.subscriptionId = liveId;
    } catch (err) {
      await this._closeClient(client);
      throw err;
    }
  }

  async _deactivateLiveSubscription(subscription) {
    const client = subscription.client;
    const liveId = subscription.subscriptionId;
    subscription.client = null;
    subscription.subscriptionId = null;

    if (!client) {
      return;
    }

    try {
      if (liveId) {
        if (typeof client.unSubscribeLive === "function") {
          await client.unSubscribeLive(liveId);
        } else if (typeof client.kill === "function") {
          await client.kill(liveId);
        } else {
          await client.query(`KILL ${liveId};`, {});
        }
      }
    } catch (err) {
      this.logger.warn("SurrealDB live unsubscribe failed", err);
    } finally {
      await this._closeClient(client);
    }
  }

  async _recoverLiveSubscriptions() {
    if (this.liveRecoveryRunning || this.liveSubscriptions.size === 0) {
      return;
    }

    this.liveRecoveryRunning = true;
    this.statusCallback("reconnecting", "recovering live subscriptions");

    try {
      const active = Array.from(this.liveSubscriptions.values()).filter((sub) => sub.active);
      for (const subscription of active) {
        try {
          await this._deactivateLiveSubscription(subscription);
          await this._activateLiveSubscription(subscription);
        } catch (err) {
          subscription.onError(err);
        }
      }
    } finally {
      this.liveRecoveryRunning = false;
      this.statusCallback(this.state, this.state === "connected" ? "connected" : this.state);
    }
  }

  async _unsubscribeAllLive() {
    const subs = Array.from(this.liveSubscriptions.values());
    this.liveSubscriptions.clear();
    for (const subscription of subs) {
      subscription.active = false;
      await this._deactivateLiveSubscription(subscription);
    }
  }

  async _signin(client) {
    const fullPayload = this._buildSigninPayload();
    const rootPayload = {
      username: this.config.username,
      password: this.config.password
    };

    try {
      return await client.signin(fullPayload);
    } catch (err) {
      // Root-level auth in SurrealDB expects username/password without namespace/database.
      if (!this.config.namespace && !this.config.database) {
        throw err;
      }
      return client.signin(rootPayload);
    }
  }

  _buildSigninPayload() {
    return {
      namespace: this.config.namespace,
      database: this.config.database,
      username: this.config.username,
      password: this.config.password,
      user: this.config.username,
      pass: this.config.password
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractLiveId(result) {
  const first = Array.isArray(result) ? result[0] : result;
  if (!first || typeof first !== "object") {
    return null;
  }
  if (typeof first.result === "string") {
    return first.result;
  }
  if (typeof first.id === "string") {
    return first.id;
  }
  if (first.result && typeof first.result.id === "string") {
    return first.result.id;
  }
  return null;
}

function normalizeLiveEvent(subscriptionId, args) {
  if (!args || args.length === 0) {
    return { subscriptionId, raw: [] };
  }
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    return { subscriptionId, ...args[0] };
  }
  if (args.length >= 2 && typeof args[0] === "string") {
    return {
      subscriptionId,
      action: args[0],
      result: args[1]
    };
  }
  return {
    subscriptionId,
    raw: args
  };
}

module.exports = ConnectionManager;
