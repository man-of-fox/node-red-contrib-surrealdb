"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const sourceDir = process.argv[2];
const targetFile = process.argv[3];

if (!sourceDir || !targetFile) {
  console.error("Usage: node import-test-flows.js <sourceDir> <targetFile>");
  process.exit(1);
}

const existingFlows = readJsonArray(targetFile, []);
const resultFlows = Array.isArray(existingFlows) ? existingFlows : [];

ensureDefaultTab(resultFlows);

const files = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".json"))
  .map((d) => d.name)
  .sort();

const existingTabLabels = new Set(
  resultFlows.filter((n) => n && n.type === "tab" && n.label).map((n) => n.label)
);

for (const fileName of files) {
  const fullPath = path.join(sourceDir, fileName);
  const imported = readJsonArray(fullPath, []);
  if (!Array.isArray(imported) || imported.length === 0) {
    continue;
  }

  const importedTabs = imported.filter((n) => n && n.type === "tab");
  if (importedTabs.length === 0) {
    continue;
  }

  const hasDuplicateLabel = importedTabs.some(
    (tab) => tab.label && existingTabLabels.has(tab.label)
  );
  if (hasDuplicateLabel) {
    continue;
  }

  const idMap = new Map();
  for (const node of imported) {
    if (node && typeof node.id === "string") {
      idMap.set(node.id, generateId());
    }
  }

  const remapped = imported.map((node) => replaceIds(node, idMap));
  for (const tab of remapped.filter((n) => n && n.type === "tab" && n.label)) {
    existingTabLabels.add(tab.label);
  }
  resultFlows.push(...remapped);
}

fs.writeFileSync(targetFile, `${JSON.stringify(resultFlows, null, 2)}\n`, "utf8");

function ensureDefaultTab(flows) {
  const hasTab = flows.some((n) => n && n.type === "tab");
  if (hasTab) {
    return;
  }
  const tabId = generateId();
  flows.push({
    id: tabId,
    type: "tab",
    label: "Flow 1",
    disabled: false,
    info: ""
  });
  flows.push({
    id: generateId(),
    type: "comment",
    z: tabId,
    name: "Default UI Test Tab",
    info: "",
    x: 160,
    y: 80,
    wires: []
  });
}

function replaceIds(value, idMap) {
  if (typeof value === "string") {
    return idMap.get(value) || value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceIds(item, idMap));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceIds(v, idMap);
    }
    return out;
  }
  return value;
}

function readJsonArray(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_err) {
    return fallback;
  }
}

function generateId() {
  return crypto.randomBytes(8).toString("hex");
}
