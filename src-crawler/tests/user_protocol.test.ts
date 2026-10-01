import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/storage/local_sqlite.ts";
import { handleUserRequest } from "../src/worker/api/user_handler.ts";
import { isUserToken, USER_TOKEN_PREFIX } from "../src/shared/identity_config.ts";
import { DOWNSTREAM_PROTOCOL_VERSION } from "../src/shared/protocol/downstream_protocol.ts";
import { PROTOCOL_VERSION } from "../src/shared/protocol/node_protocol.ts";

function jsonRequest(path: string, method: string, body?: unknown, token?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  return new Request(`http://127.0.0.1:3737${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

describe("User Protocol (/v1/user/*) and Unified Delisting", () => {
  test("issueUserToken returns vrcp_usr_ prefixed 73-char token and authenticates", () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const issued = store.issueUserToken("alice", "alice@example.com");
      expect(issued.userName).toBe("alice");
      expect(issued.token.startsWith(USER_TOKEN_PREFIX)).toBe(true);
      expect(issued.token.length).toBe(73);
      expect(isUserToken(issued.token)).toBe(true);

      const authed = store.authenticateUser(issued.token);
      expect(authed).not.toBeNull();
      expect(authed?.userId).toBe(issued.userId);
      expect(authed?.userName).toBe("alice");

      expect(store.authenticateUser("vrcp_usr_" + "0".repeat(64))).toBeNull();
      expect(store.authenticateUser("invalid-token")).toBeNull();
    } finally {
      store.close();
    }
  });

  test("POST /v1/user/nodes issues capability-encoded node token for authenticated user", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("bob");

      // Unauthorized without token
      const reqNoAuth = jsonRequest("/v1/user/nodes", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        nodeId: "bob-node-1",
        requestedCapabilities: ["booth", "github"]
      });
      const resNoAuth = await handleUserRequest(reqNoAuth, store);
      expect(resNoAuth.status).toBe(401);

      // Authorized with user token
      const reqAuth = jsonRequest("/v1/user/nodes", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        nodeId: "bob-node-1",
        requestedCapabilities: ["booth", "github"]
      }, user.token);
      const resAuth = await handleUserRequest(reqAuth, store);
      expect(resAuth.status).toBe(201);
      const data = await resAuth.json() as any;
      expect(data.nodeId).toBe("bob-node-1");
      expect(data.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    } finally {
      store.close();
    }
  });

  test("POST /v1/user/apps registers downstream application for authenticated user", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("carol");

      const req = jsonRequest("/v1/user/apps", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "VRChat Manager Tool",
        contactEmail: "tool@example.com"
      }, user.token);
      const res = await handleUserRequest(req, store);
      expect(res.status).toBe(201);
      const data = await res.json() as any;
      expect(data.appName).toBe("VRChat Manager Tool");
      expect(data.appToken).toMatch(/^vrcp_app_[a-f0-9]{64}$/);
    } finally {
      store.close();
    }
  });

  test("POST /v1/user/delist suppresses target and marks package delisted", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("creator-dan");

      // Seed a canonical package first
      const canonicalId = "pkg-to-delist-123";
      store.db.prepare(`
        INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
        VALUES (?, 'tools', 'editor_tool', 'active', 'My Cool Tool', 'com.dan.tool', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')
      `).run(canonicalId);

      // Authenticated user delisting
      const req = jsonRequest("/v1/user/delist", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        canonicalId,
        reason: "Owner requested removal"
      }, user.token);

      const res = await handleUserRequest(req, store);
      expect(res.status).toBe(202);
      const data = await res.json() as any;
      expect(data.status).toBe("accepted");
      expect(data.action).toBe("delisted");
      expect(data.requesterType).toBe("user");

      // Verify lifecycle changed to delisted
      const row = store.db.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?").get(canonicalId) as { lifecycle: string };
      expect(row.lifecycle).toBe("delisted");
    } finally {
      store.close();
    }
  });

  test("POST /v1/delist (unauthenticated) requires bio_token or dns_txt proof", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      // 1. Missing proofKind fails with 400 proof_required
      const reqNoProof = jsonRequest("/v1/delist", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        targetUrl: "https://booth.pm/en/items/999999",
        reason: "Opting out"
      });
      const resNoProof = await handleUserRequest(reqNoProof, store);
      expect(resNoProof.status).toBe(400);

      // 2. manual_notice fails directing to email per LEGAL §9.2
      const reqManual = jsonRequest("/v1/delist", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        targetUrl: "https://booth.pm/en/items/999999",
        reason: "Opting out",
        proofKind: "manual_notice"
      });
      const resManual = await handleUserRequest(reqManual, store);
      expect(resManual.status).toBe(400);

      // 3. storefront_bio_token succeeds
      const reqValid = jsonRequest("/v1/delist", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        targetUrl: "https://booth.pm/en/items/999999",
        reason: "Opting out",
        proofKind: "storefront_bio_token",
        proofValue: "vrc-delist-token-abc"
      });
      const resValid = await handleUserRequest(reqValid, store);
      expect(resValid.status).toBe(202);
      const data = await resValid.json() as any;
      expect(data.status).toBe("accepted");
      expect(data.requesterType).toBe("unauthenticated_creator");
    } finally {
      store.close();
    }
  });
});
