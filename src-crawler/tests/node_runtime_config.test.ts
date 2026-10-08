import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { loadNodeRuntimeConfig, NodeRuntimeConfigSchema } from "../src/config/runtime_config.ts";
import { ClaimRequestSchema, HeartbeatRequestSchema } from "vrc-packages-network/node";
import { coordinatorEndpointAllowed, resolveCoordinatorUrl, isTransientEdgeStatus, CoordinatorClient } from "../src/client/node_client.ts";
import { loadScopedGitHubTokenFromEnvFile } from "../src/adapters/observation_adapter.ts";

const secret = "c".repeat(64);
const outputPath = resolve(import.meta.dir, "../dist/tests");
mkdirSync(outputPath, { recursive: true });
const tempRoot = realpathSync(outputPath);
function fixtureDirectory(): string { return mkdtempSync(join(tempRoot, "vrcp-crawler-node-config-")); }
function removeFixtureDirectory(directory: string): void {
  if (!realpathSync(directory).startsWith(tempRoot + sep)) throw new Error("Unexpected config fixture path");
  rmSync(directory, { recursive: true, force: true });
}

describe("standalone node runtime configuration", () => {
  test("node config, claim and heartbeat reject URL navigation IDs but retain dotted IDs", () => {
    for (const nodeId of [".", "..", "...", "Node.1", "node-1", "node_1"]) {
      const valid = nodeId !== "." && nodeId !== "..";
      const identity = { schemaVersion: 1, nodeId, capabilities: ["vpm"] };
      expect(NodeRuntimeConfigSchema.safeParse({ ...identity, coordinatorUrl: "http://127.0.0.1:8787" }).success).toBe(valid);
      expect(ClaimRequestSchema.safeParse(identity).success).toBe(valid);
      expect(HeartbeatRequestSchema.safeParse({ ...identity, state: "idle" }).success).toBe(valid);
    }
  });
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

  test("loads configuration directly from environment without requiring a config file", () => {
    const directory = fixtureDirectory();
    try {
      const config = loadNodeRuntimeConfig(directory, {
        NODE_ID: "env-node-1",
        NODE_TOKEN: secret,
        COORDINATOR_URL: "http://127.0.0.1:8787",
        NODE_CAPABILITIES: "vpm,github",
        NODE_DB_PATH: join(directory, "env_node.db")
      });
      expect(config).toEqual({
        nodeId: "env-node-1",
        baseUrl: "http://127.0.0.1:8787",
        capabilities: ["vpm", "github"],
        token: secret,
        databasePath: join(directory, "env_node.db")
      });
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
    expect(coordinatorEndpointAllowed("https://vrcp-coordinator.workers.dev")).toBe(true);
    expect(coordinatorEndpointAllowed("https://vrcp-coordinator.workers.dev/v1/node/jobs/claim")).toBe(true);
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
    expect(coordinatorEndpointAllowed("https://user:pass@vrcp-coordinator.workers.dev")).toBe(false);
    expect(coordinatorEndpointAllowed("http://user:pass@127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("https://vrcp-coordinator.workers.dev#anchor")).toBe(false);
    expect(coordinatorEndpointAllowed("ws://127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("ftp://127.0.0.1:8787")).toBe(false);
    expect(coordinatorEndpointAllowed("not-a-valid-url")).toBe(false);
  });
});

describe("coordinator client transport & edge resilience", () => {
  test("resolveCoordinatorUrl preserves custom domain subpaths and normalizes trailing slashes", () => {
    expect(resolveCoordinatorUrl("https://coordinator.example.com", "/v1/node/jobs/claim").toString())
      .toBe("https://coordinator.example.com/v1/node/jobs/claim");
    expect(resolveCoordinatorUrl("https://coordinator.example.com/", "v1/node/jobs/claim").toString())
      .toBe("https://coordinator.example.com/v1/node/jobs/claim");
    expect(resolveCoordinatorUrl("https://domain.org:8443/custom/edge", "/v1/node/heartbeat").toString())
      .toBe("https://domain.org:8443/custom/edge/v1/node/heartbeat");
    expect(resolveCoordinatorUrl("https://domain.org:8443/custom/edge/", "v1/node/heartbeat").toString())
      .toBe("https://domain.org:8443/custom/edge/v1/node/heartbeat");
  });

  test("isTransientEdgeStatus identifies Cloudflare and gateway retryable status codes", () => {
    expect(isTransientEdgeStatus(502)).toBe(true);
    expect(isTransientEdgeStatus(503)).toBe(true);
    expect(isTransientEdgeStatus(504)).toBe(true);
    expect(isTransientEdgeStatus(520)).toBe(true);
    expect(isTransientEdgeStatus(521)).toBe(true);
    expect(isTransientEdgeStatus(522)).toBe(true);
    expect(isTransientEdgeStatus(523)).toBe(true);
    expect(isTransientEdgeStatus(524)).toBe(true);

    expect(isTransientEdgeStatus(200)).toBe(false);
    expect(isTransientEdgeStatus(400)).toBe(false);
    expect(isTransientEdgeStatus(401)).toBe(false);
    expect(isTransientEdgeStatus(403)).toBe(false);
    expect(isTransientEdgeStatus(404)).toBe(false);
    expect(isTransientEdgeStatus(409)).toBe(false);
    expect(isTransientEdgeStatus(500)).toBe(false);
  });

  test("CoordinatorClient retries transient 522 edge status and succeeds on subsequent attempt", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = (async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: "Cloudflare Connection Timed Out" }), {
            status: 522,
            headers: { "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({
          schemaVersion: 1,
          status: "empty",
          retryAfterMs: 3000
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }) as any;

      const client = new CoordinatorClient(
        "https://vrcp-coordinator.workers.dev",
        secret,
        "test-node-1",
        ["vpm"],
        { maxRetries: 2, retryBaseDelayMs: 10 }
      );

      const claimRes = await client.claim();
      expect(callCount).toBe(2);
      expect(claimRes.status).toBe("empty");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("CoordinatorClient fails without retry on non-transient 403 authorization rejection", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    try {
      globalThis.fetch = (async () => {
        callCount++;
        return new Response(JSON.stringify({ error: "Capability not granted" }), {
          status: 403,
          headers: { "Content-Type": "application/json" }
        });
      }) as any;

      const client = new CoordinatorClient(
        "https://vrcp-coordinator.workers.dev",
        secret,
        "test-node-1",
        ["vpm"],
        { maxRetries: 2, retryBaseDelayMs: 10 }
      );

      expect(client.claim()).rejects.toThrow("Coordinator 403");
      expect(callCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
