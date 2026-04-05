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

  async stop() {
    this._stopTimers();
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
      try {
        const client = new Surreal();
        await client.connect(this.config.url);
        await this._authenticate(client);
        await this._useDatabase(client);
        return client;
      } catch (err) {
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
      const signinResult = await client.signin(this._buildSigninPayload());

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

    const result = await client.signin({
      ...this._buildSigninPayload()
    });

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

module.exports = ConnectionManager;
