"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RecordId, StringRecordId, Table } = require("surrealdb");
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

test("toSdkTarget converts table targets to Table", () => {
  const sdkTarget = toSdkTarget("users");
  assert.ok(sdkTarget instanceof Table);
  assert.equal(String(sdkTarget), "users");
});

test("resolveTarget preserves SDK record IDs including escaped identifiers", () => {
  const recordId = new RecordId("users", "has spaces");
  assert.equal(resolveTarget({ table: "wrong" }, { recordId }), String(recordId));
});
