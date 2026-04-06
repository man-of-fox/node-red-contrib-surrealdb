"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { StringRecordId } = require("surrealdb");
const { resolveTarget, toSdkTarget } = require("../nodes/_shared");

test("resolveTarget builds record target from table + recordId suffix", () => {
  const target = resolveTarget({ table: "users", recordId: "abc" }, {});
  assert.equal(target, "users:abc");
});

test("resolveTarget keeps full record target when recordId already contains table", () => {
  const target = resolveTarget({ table: "", recordId: "users:abc" }, {});
  assert.equal(target, "users:abc");
});

test("toSdkTarget converts record targets to StringRecordId", () => {
  const sdkTarget = toSdkTarget("users:abc");
  assert.ok(sdkTarget instanceof StringRecordId);
});

test("toSdkTarget keeps table targets as plain strings", () => {
  const sdkTarget = toSdkTarget("users");
  assert.equal(typeof sdkTarget, "string");
  assert.equal(sdkTarget, "users");
});
