import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "../src/node/runtime_config.ts";
import { coordinatorEndpointAllowed } from "../src/node/coordinator_client.ts";
import { loadScopedGitHubTokenFromEnvFile } from "../src/node/observation_adapter.ts";

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
        capabilities: ["vpm", "shopify"], token: secret,
        databasePath: join(directory, "node.db"),
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
        coordinatorUrl: "http://127.0.0.1:8787", capabilities: ["vpm"], databaseFile: "node.db" });
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

  test("supports explicit databaseFile in config and NODE_DB_PATH override", () => {
    const directory = fixtureDirectory();
    try {
      writeFileSync(join(directory, "node.config.json"), JSON.stringify({ schemaVersion: 1,
        nodeId: "desktop-custom", coordinatorUrl: "http://127.0.0.1:8787",
        capabilities: ["vpm"], databaseFile: "custom_node.db" }));
      expect(loadNodeRuntimeConfig(directory, { NODE_TOKEN: secret }).databasePath)
        .toBe(join(directory, "custom_node.db"));
      expect(loadNodeRuntimeConfig(directory, { NODE_TOKEN: secret, NODE_DB_PATH: "override.db" }).databasePath)
        .toBe("override.db");
    } finally { removeFixtureDirectory(directory); }
  });

  test("resolves scoped GitHub token only from .env in the binary working directory", () => {
    const directory = fixtureDirectory();
    try {
      expect(loadScopedGitHubTokenFromEnvFile(directory)).toBeUndefined();
      writeFileSync(join(directory, ".env"), "GITHUB_TOKEN=ghp_test_token_12345\n");
      expect(loadScopedGitHubTokenFromEnvFile(directory)).toBe("ghp_test_token_12345");
      const emptyDir = fixtureDirectory();
      try {
        expect(loadScopedGitHubTokenFromEnvFile(emptyDir)).toBeUndefined();
      } finally {
        removeFixtureDirectory(emptyDir);
      }
    } finally { removeFixtureDirectory(directory); }
  });

  test("resolves scoped GitHub token from bin/.env as fallback in working directory", () => {
    const directory = fixtureDirectory();
    try {
      mkdirSync(join(directory, "bin"), { recursive: true });
      writeFileSync(join(directory, "bin", ".env"), "GH_TOKEN=ghp_bin_token_67890\n");
      expect(loadScopedGitHubTokenFromEnvFile(directory)).toBe("ghp_bin_token_67890");
    } finally { removeFixtureDirectory(directory); }
  });
});

describe("coordinatorEndpointAllowed dual-mode Cloudflare endpoint validation", () => {
  test("accepts valid production Cloudflare Worker URLs over HTTPS", () => {
    expect(coordinatorEndpointAllowed("https://vrc-coordinator.workers.dev")).toBe(true);
    expect(coordinatorEndpointAllowed("https://vrc-coordinator.workers.dev/v1/node/jobs/claim")).toBe(true);
    expect(coordinatorEndpointAllowed("https://custom-coordinator.example.com")).toBe(true);
    expect(coordinatorEndpointAllowed("https://subdomain.domain.org:8443/api")).toBe(true);
  });

  test("accepts local coordinator simulation over HTTP strictly on loopback", () => {
    expect(coordinatorEndpointAllowed("http://localhost:8787")).toBe(true);
    expect(coordinatorEndpointAllowed("http://127.0.0.1:8787")).toBe(true);
    expect(coordinatorEndpointAllowed("http://[::1]:8787")).toBe(true);
    expect(coordinatorEndpointAllowed("http://127.0.0.1")).toBe(true);
    expect(coordinatorEndpointAllowed("http://localhost")).toBe(true);
  });

  test("rejects cleartext non-loopback HTTP endpoints to prevent credential leakage", () => {
    expect(coordinatorEndpointAllowed("http://external-host:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("http://192.168.1.10:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("http://10.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("http://172.16.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("http://coordinator.workers.dev")).toBe(false);
    expect(coordinatorEndpointAllowed("http://example.com")).toBe(false);
  });

  test("rejects embedded user credentials, URL fragments, and invalid protocols", () => {
    expect(coordinatorEndpointAllowed("https://user:pass@vrc-coordinator.workers.dev")).toBe(false);
    expect(coordinatorEndpointAllowed("http://user:pass@127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("https://vrc-coordinator.workers.dev#anchor")).toBe(false);
    expect(coordinatorEndpointAllowed("ws://127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("ftp://127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("not-a-valid-url")).toBe(false);
  });
});

