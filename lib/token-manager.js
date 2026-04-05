"use strict";

class TokenManager {
  constructor(options = {}) {
    this.skewSeconds = Number(options.skewSeconds || 60);
    this.token = null;
    this.expiresAtSec = null;
  }

  setToken(token) {
    this.token = token || null;
    this.expiresAtSec = this._decodeJwtExp(token);
  }

  getToken() {
    return this.token;
  }

  shouldRefresh() {
    if (!this.token || !this.expiresAtSec) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= this.expiresAtSec - this.skewSeconds;
  }

  isExpired() {
    if (!this.token || !this.expiresAtSec) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= this.expiresAtSec;
  }

  _decodeJwtExp(token) {
    try {
      if (!token || typeof token !== "string" || token.split(".").length < 2) {
        return null;
      }
      const payload = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return Number(decoded.exp || 0) || null;
    } catch (_err) {
      return null;
    }
  }
}

module.exports = TokenManager;

