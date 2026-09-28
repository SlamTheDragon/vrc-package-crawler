import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "../src/node/runtime_config.ts";

const secret = "c".repeat(64);
const tempRoot = realpathSync(tmpdir());
function fixtureDirectory(): string { return mkdtempSync(join(tempRoot, "vrc-node-config-")); }
function removeFixtureDirectory(directory: string): void {
  if (!realpathSync(directory).startsWith(tempRoot + sep)) throw new Error("Unexpected config fixture path");
  rmSync(directory, { recursive: true, force: true });
}

describe("standalone node runtime configuration", () => {
  test("loads a strict non-secret config from the launch directory and requires a separate key", () => {
    const directory = fixtureDirectory();
    try {
      writeFileSync(join(directory, "node.config.json"), JSON.stringify({ schemaVersion: 1,
        nodeId: "desktop-1", coordinatorUrl: "http://127.0.0.1:8787", capabilities: ["vpm", "shopify"] }));
      expect(loadNodeRuntimeConfig(directory, { NODE_TOKEN: secret })).toEqual({
        nodeId: "desktop-1", baseUrl: "http://127.0.0.1:8787",
        capabilities: ["vpm", "shopify"], token: secret
      });
      expect(() => loadNodeRuntimeConfig(directory, {})).toThrow("NODE_TOKEN");
      expect(() => loadNodeRuntimeConfig(directory, { NODE_TOKEN: secret,
        NODE_ID: "ignored-env-id" })).not.toThrow();
    } finally { removeFixtureDirectory(directory); }
  });

  test("initialization creates one non-secret config without replacing operator edits", () => {
    const directory = fixtureDirectory();
    try {
      const path = initializeNodeConfig(directory, "desktop-1", "http://127.0.0.1:8787", ["vpm"]);
      const saved = readFileSync(path, "utf8");
      expect(JSON.parse(saved)).toEqual({ schemaVersion: 1, nodeId: "desktop-1",
        coordinatorUrl: "http://127.0.0.1:8787", capabilities: ["vpm"] });
      expect(saved).not.toContain(secret);
      expect(() => initializeNodeConfig(directory, "replacement", "http://127.0.0.1:8787", ["vpm"]))
        .toThrow();
      expect(readFileSync(path, "utf8")).toBe(saved);
    } finally { removeFixtureDirectory(directory); }
  });

  test("does not fall back to environment when a present or explicit config is invalid", () => {
    const directory = fixtureDirectory();
    const legacyEnv = { NODE_TOKEN: secret, NODE_ID: "legacy-node", NODE_CAPABILITIES: "vpm" };
    try {
      expect(loadNodeRuntimeConfig(directory, legacyEnv).nodeId).toBe("legacy-node");
      expect(() => loadNodeRuntimeConfig(directory, { ...legacyEnv,
        NODE_CONFIG_PATH: join(directory, "missing.json") })).toThrow("config");
      writeFileSync(join(directory, "node.config.json"), JSON.stringify({ schemaVersion: 1,
        nodeId: "desktop-1", coordinatorUrl: "http://127.0.0.1:8787",
        capabilities: ["vpm"], token: secret }));
      expect(() => loadNodeRuntimeConfig(directory, legacyEnv)).toThrow("config");
      writeFileSync(join(directory, "node.config.json"), JSON.stringify({ schemaVersion: 2,
        nodeId: "desktop-1", coordinatorUrl: "http://127.0.0.1:8787", capabilities: ["vpm"] }));
      expect(() => loadNodeRuntimeConfig(directory, legacyEnv)).toThrow("config");
    } finally { removeFixtureDirectory(directory); }
  });

  test("rejects ambiguous capabilities and unsafe coordinator URLs", () => {
    const directory = fixtureDirectory();
    try {
      for (const [capabilities, coordinatorUrl] of [
        [["vpm", "vpm"], "http://127.0.0.1:8787"],
        [["vpm"], "http://example.org:8787"],
        [["vpm"], "https://user:pass@example.org/"]
      ] as const) {
        writeFileSync(join(directory, "node.config.json"), JSON.stringify({ schemaVersion: 1,
          nodeId: "desktop-1", coordinatorUrl, capabilities }));
        expect(() => loadNodeRuntimeConfig(directory, { NODE_TOKEN: secret })).toThrow("config");
      }
    } finally { removeFixtureDirectory(directory); }
  });
});
