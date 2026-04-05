"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const TokenManager = require("../lib/token-manager");

test("TokenManager stores and returns token", () => {
  const manager = new TokenManager();
  manager.setToken("abc.def.ghi");
  assert.equal(manager.getToken(), "abc.def.ghi");
});

test("TokenManager decodes exp and requests refresh within skew window", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = makeJwt({ exp: nowSec + 30 });
  const manager = new TokenManager({ skewSeconds: 60 });

  manager.setToken(token);

  assert.equal(manager.shouldRefresh(), true);
  assert.equal(manager.isExpired(), false);
});

test("TokenManager marks expired tokens", () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = makeJwt({ exp: nowSec - 1 });
  const manager = new TokenManager({ skewSeconds: 5 });

  manager.setToken(token);

  assert.equal(manager.isExpired(), true);
});

test("TokenManager handles invalid token payload safely", () => {
  const manager = new TokenManager();
  manager.setToken("invalid");

  assert.equal(manager.shouldRefresh(), false);
  assert.equal(manager.isExpired(), false);
});

function makeJwt(payload) {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.sig`;
}
