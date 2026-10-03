import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../../src-web/tests/support/local_sqlite.js";
import { handleUserRequest } from "../../src/worker/api/user_handler.ts";
import { isUserToken, USER_TOKEN_PREFIX } from "../../src-crawler/src/shared/identity_config.js";

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

describe("User Protocol (/v1/user/*)", () => {
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

  test("retired user node POST cannot issue, replace or reactivate credentials", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("bob");

      store.createNodeCredential("existing-node", ["vpm"]);
      store.db.prepare("UPDATE node_credentials SET revoked_at=? WHERE node_id=?").run(new Date().toISOString(), "existing-node");
      const before = store.db.prepare("SELECT * FROM node_credentials ORDER BY node_id").all();
      for (const token of [undefined, user.token]) {
        for (const nodeId of ["new-node", "existing-node"]) {
          const response = await handleUserRequest(jsonRequest("/v1/user/nodes", "POST", {
            schemaVersion: 1, nodeId, requestedCapabilities: ["vpm"], reason: "Retired route fixture"
          }, token), store);
          expect(response.status).toBe(404);
        }
      }
      expect(store.db.prepare("SELECT * FROM node_credentials ORDER BY node_id").all()).toEqual(before);
      expect((store.db.prepare("SELECT COUNT(*) AS count FROM node_credential_actions").get() as any).count).toBe(0);
    } finally {
      store.close();
    }
  });

  test("user app GET views are owner-scoped, paginated and secret-free", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("carol");

      const other = store.issueUserToken("other-owner");
      const owned = [store.registerApp({ schemaVersion: 1, appName: "First app" }, user.userId),
        store.registerApp({ schemaVersion: 1, appName: "Second app" }, user.userId)];
      const foreign = store.registerApp({ schemaVersion: 1, appName: "Other app" }, other.userId);
      const unowned = store.registerApp({ schemaVersion: 1, appName: "Operator app" });
      const response = await handleUserRequest(jsonRequest("/v1/user/apps?limit=1", "GET", undefined, user.token), store);
      expect(response.status).toBe(200);
      const page = await response.json() as any;
      expect(page.apps).toHaveLength(1);
      expect(page.nextCursor).toBe(page.apps[0].appId);
      const next = await handleUserRequest(jsonRequest(`/v1/user/apps?limit=1&cursor=${page.nextCursor}`, "GET", undefined, user.token), store);
      const second = await next.json() as any;
      expect(second.apps).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...page.apps, ...second.apps].map(app => app.appId))).toEqual(new Set(owned.map(app => app.appId)));
      const detail = await handleUserRequest(jsonRequest(`/v1/user/apps/${owned[0].appId}`, "GET", undefined, user.token), store);
      expect(detail.status).toBe(200);
      const app = (await detail.json() as any).app;
      expect(Object.keys(app).sort()).toEqual(["appId", "appName", "createdAt", "permissions", "revokedAt"].sort());
      for (const id of [foreign.appId, unowned.appId, crypto.randomUUID()]) {
        expect((await handleUserRequest(jsonRequest(`/v1/user/apps/${id}`, "GET", undefined, user.token), store)).status).toBe(404);
      }
      for (const query of ["limit=0", "limit=101", "cursor=bad", "ownerId=other", "limit=1&limit=2"]) {
        expect((await handleUserRequest(jsonRequest(`/v1/user/apps?${query}`, "GET", undefined, user.token), store)).status).toBe(400);
      }
      expect((await handleUserRequest(jsonRequest("/v1/user/apps/not-an-id", "GET", undefined, user.token), store)).status).toBe(404);
      const unavailable = Object.create(store) as LocalCoordinatorStore;
      unavailable.listUserApps = () => { throw new Error("private storage diagnostic"); };
      const failure = await handleUserRequest(jsonRequest("/v1/user/apps", "GET", undefined, user.token), unavailable);
      expect(failure.status).toBe(500);
      expect(await failure.text()).not.toContain("private storage diagnostic");
      expect((await handleUserRequest(jsonRequest("/v1/user/apps", "POST", { schemaVersion: 1, appName: "Removed" }, user.token), store)).status).toBe(404);
      expect((await handleUserRequest(jsonRequest("/v1/user/apps", "GET"), store)).status).toBe(401);
      store.db.prepare("UPDATE registered_users SET revoked_at=? WHERE user_id=?").run(new Date().toISOString(), user.userId);
      expect((await handleUserRequest(jsonRequest("/v1/user/apps", "GET", undefined, user.token), store)).status).toBe(401);
    } finally {
      store.close();
    }
  });

  test("retired user delisting routes return 404 without writes", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("removal-test");
      const target = "https://booth.pm/en/items/999999";
      for (const token of [undefined, user.token]) {
        for (const path of ["/v1/user/delist", "/v1/delist", "/v1/registrant/delist"]) {
          const response = await handleUserRequest(jsonRequest(path, "POST", {
            schemaVersion: 1, targetUrl: target, reason: "Removal requested",
            proofKind: "storefront_bio_token", proofValue: "Unverified test text"
          }, token), store);
          expect(response.status).toBe(404);
        }
      }
      for (const table of ["creator_opt_outs", "suppressed_urls", "catalog_reports"]) {
        expect((store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as any).count).toBe(0);
      }
    } finally { store.close(); }
  });
});
