import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalCoordinatorStore } from "../src/worker/storage/local_sqlite.ts";
import { handleDownstreamRequest } from "../src/worker/api/downstream_handler.ts";
import { DOWNSTREAM_PROTOCOL_VERSION } from "../src/shared/protocol/downstream_protocol.ts";

describe("Downstream Client Protocol & Demand Feedback Signals", () => {
  let tempDir: string;
  let dbPath: string;
  let store: LocalCoordinatorStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "vrc-downstream-test-"));
    dbPath = join(tempDir, "coordinator.db");
    store = new LocalCoordinatorStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const request = (path: string, method: string, body?: unknown, token?: string): Request => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return new Request(`http://127.0.0.1:8787${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  test("POST /v1/apps/register creates downstream application with vrcp_app_ token", async () => {
    const res = await handleDownstreamRequest(
      request("/v1/apps/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "ALCOM Desktop Manager",
        contactEmail: "alcom@example.org",
        description: "Package discovery client for VRChat"
      }),
      store
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.schemaVersion).toBe(1);
    expect(data.appName).toBe("ALCOM Desktop Manager");
    expect(data.appId).toBeDefined();
    expect(data.appToken).toMatch(/^vrcp_app_[a-f0-9]{64}$/);
    expect(data.permissions).toContain("catalog:search");
    expect(data.permissions).toContain("demand:feedback");
  });

  test("POST /v1/apps/feedback requires authentication and ingests demand signals", async () => {
    // 1. Register app
    const regRes = await handleDownstreamRequest(
      request("/v1/apps/register", "POST", {
        schemaVersion: 1,
        appName: "VCC Mobile Companion"
      }),
      store
    );
    const { appToken } = await regRes.json() as { appToken: string };

    // 2. Reject unauthenticated feedback
    const unauthRes = await handleDownstreamRequest(
      request("/v1/apps/feedback", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "physbone optimizer"
      }),
      store
    );
    expect(unauthRes.status).toBe(401);

    // 3. Reject invalid token
    const badTokenRes = await handleDownstreamRequest(
      request("/v1/apps/feedback", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "physbone optimizer"
      }, "vrcp_app_0000000000000000000000000000000000000000000000000000000000000000"),
      store
    );
    expect(badTokenRes.status).toBe(401);

    // 4. Accept valid search miss feedback signal
    const feedbackRes = await handleDownstreamRequest(
      request("/v1/apps/feedback", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "novel shader generator",
        zeroHits: true,
        requestedPlatform: "booth",
        category: "shader"
      }, appToken),
      store
    );
    expect(feedbackRes.status).toBe(200);
    const feedbackData = await feedbackRes.json() as any;
    expect(feedbackData.schemaVersion).toBe(1);
    expect(feedbackData.status).toBe("accepted");
    expect(feedbackData.signalId).toBeDefined();
    expect(feedbackData.recordedAt).toBeDefined();

    // 5. Accept refresh demand signal for specific target
    const refreshRes = await handleDownstreamRequest(
      request("/v1/apps/feedback", "POST", {
        schemaVersion: 1,
        signalType: "refresh_demand",
        requestedPlatform: "github",
        targetUrl: "https://github.com/example-author/stale-tool"
      }, appToken),
      store
    );
    expect(refreshRes.status).toBe(200);
  });

  test("GET /v1/catalog/random returns sampled entries with optional filters", async () => {
    // Register app
    const reg = await handleDownstreamRequest(
      request("/v1/apps/register", "POST", { schemaVersion: 1, appName: "Random Explorer" }),
      store
    );
    const { appToken } = await reg.json() as { appToken: string };

    // Seed dummy canonical packages directly into DB
    const now = new Date().toISOString();
    store.db.exec(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
      VALUES
        ('pkg-1', 'tools', 'editor_tool', 'active', 'Tool Alpha', 'com.example.alpha', '${now}', '${now}'),
        ('pkg-2', 'tools', 'avatar_tool', 'active', 'Tool Beta', 'com.example.beta', '${now}', '${now}'),
        ('pkg-3', 'assets', 'shader', 'active', 'Uber Shader', NULL, '${now}', '${now}'),
        ('pkg-4', 'avatars', 'base_mesh', 'delisted', 'Delisted Avatar', NULL, '${now}', '${now}');
    `);

    // Sample random items
    const res = await handleDownstreamRequest(
      request("/v1/catalog/random?limit=2", "GET", undefined, appToken),
      store
    );
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items.length).toBeLessThanOrEqual(2);
    // Never returns delisted items
    expect(body.items.some((i: any) => i.canonicalId === "pkg-4")).toBe(false);

    // Filter by umbrella
    const toolsRes = await handleDownstreamRequest(
      request("/v1/catalog/random?umbrella=tools", "GET", undefined, appToken),
      store
    );
    expect(toolsRes.status).toBe(200);
    const toolsBody = await toolsRes.json() as any;
    for (const item of toolsBody.items) {
      expect(item.umbrella).toBe("tools");
    }
  });

  test("POST /v1/catalog/search performs text search and keyset pagination", async () => {
    // Register app
    const reg = await handleDownstreamRequest(
      request("/v1/apps/register", "POST", { schemaVersion: 1, appName: "Search Tester" }),
      store
    );
    const { appToken } = await reg.json() as { appToken: string };

    const t1 = new Date(Date.now() - 3000).toISOString();
    const t2 = new Date(Date.now() - 2000).toISOString();
    const t3 = new Date(Date.now() - 1000).toISOString();

    store.db.exec(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
      VALUES
        ('pkg-1', 'tools', 'editor_tool', 'active', 'Super VRChat Tool', 'com.vrc.tool', '${t1}', '${t1}'),
        ('pkg-2', 'tools', 'avatar_tool', 'active', 'Avatar Optimizer', 'com.vrc.opt', '${t2}', '${t2}'),
        ('pkg-3', 'assets', 'shader', 'active', 'Toon Water Shader', NULL, '${t3}', '${t3}');
    `);

    // Search query
    const searchRes = await handleDownstreamRequest(
      request("/v1/catalog/search", "POST", {
        schemaVersion: 1,
        query: "Optimizer"
      }, appToken),
      store
    );
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json() as any;
    expect(searchBody.items.length).toBe(1);
    expect(searchBody.items[0].displayName).toBe("Avatar Optimizer");
    expect(searchBody.totalEstimated).toBe(1);

    // Search with limit and pagination
    const pageRes = await handleDownstreamRequest(
      request("/v1/catalog/search", "POST", {
        schemaVersion: 1,
        umbrella: "tools",
        limit: 1
      }, appToken),
      store
    );
    expect(pageRes.status).toBe(200);
    const pageBody = await pageRes.json() as any;
    expect(pageBody.items.length).toBe(1);
    expect(pageBody.nextCursor).toBeDefined();
    expect(pageBody.totalEstimated).toBe(2);

    // Canonical API_ROUTES /v1/app/index/search route
    const canonicalSearch = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", {
        schemaVersion: 1,
        query: "Optimizer",
        queryOrigin: "user_authored"
      }, appToken),
      store
    );
    expect(canonicalSearch.status).toBe(200);
    const canonicalBody = await canonicalSearch.json() as any;
    expect(canonicalBody.items[0].displayName).toBe("Avatar Optimizer");

    // Canonical API_ROUTES /v1/app/reports route
    const canonicalReport = await handleDownstreamRequest(
      request("/v1/app/reports", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "Nonexistent"
      }, appToken),
      store
    );
    expect(canonicalReport.status).toBe(200);
  });
});
