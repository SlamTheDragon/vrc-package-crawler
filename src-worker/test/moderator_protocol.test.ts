import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "./support/local_sqlite.js";
import { handleModeratorRequest, createModeratorHandler } from "../src/api/moderator_handler.ts";
import {
  MODERATOR_PROTOCOL_VERSION,
  ModeratorRatingListResponseSchema,
  SetRatingAdjustmentResponseSchema,
  encodeModeratorRatingCursor,
  ModeratorAppListResponseSchema,
  ModeratorReviewAppCandidateResponseSchema
} from "vrc-packages-api";

function jsonRequest(path: string, method: string, body?: unknown, token?: string, headers?: Record<string, string>): Request {
  const reqHeaders: Record<string, string> = {
    ...headers
  };
  if (body !== undefined && !reqHeaders["content-type"]) {
    reqHeaders["content-type"] = "application/json";
  }
  if (token) {
    reqHeaders["authorization"] = `Bearer ${token}`;
  }
  return new Request(`http://127.0.0.1:3737${path}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function seedTestPackage(
  store: LocalCoordinatorStore,
  canonicalId: string,
  displayName: string,
  contentRating: "general" | "mature" | "sexual_suggestive" | "adult_restricted" | "prohibited",
  umbrella: "assets" | "tools" | "avatars" = "assets",
  category = "props"
) {
  const now = new Date(store["now"]()).toISOString();
  store.db.prepare(`
    INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, created_at, updated_at, content_rating)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(canonicalId, umbrella, category, displayName, now, now, contentRating);
}

describe("Moderator Protocol (/v1/moderator/*) — R56-C56C1", () => {
  test("authenticates and authorizes age-verified moderator users strictly", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      seedTestPackage(store, "com.author.pack1", "Pack 1", "mature");

      // 1. Missing authorization header -> 401
      const noAuthRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET"), store);
      expect(noAuthRes.status).toBe(401);
      const noAuthBody = await noAuthRes.json() as any;
      expect(noAuthBody.error).toContain("User bearer credential required");

      // 2. Malformed authorization header -> 401
      const badHeaderRes = await handleModeratorRequest(new Request("http://127.0.0.1:3737/v1/moderator/ratings", {
        headers: { "authorization": "Basic invalid" }
      }), store);
      expect(badHeaderRes.status).toBe(401);

      // 3. Non-existent token -> 401
      const ghostTokenRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, "vrcp_usr_" + "f".repeat(64)), store);
      expect(ghostTokenRes.status).toBe(401);

      // 4. Regular user (not verified, not moderator) -> 403
      const regularUser = store.issueUserToken("regular_user", "reg@test.com", false, false);
      const regRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, regularUser.token), store);
      expect(regRes.status).toBe(403);
      const regBody = await regRes.json() as any;
      expect(regBody.error).toBe("Moderator authority with verified age required");

      // 5. Age-verified user without moderator flag -> 403
      const ageOnlyUser = store.issueUserToken("age_only", "age@test.com", true, false);
      const ageOnlyRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, ageOnlyUser.token), store);
      expect(ageOnlyRes.status).toBe(403);

      // 6. Moderator user without age verification -> 403
      const modOnlyUser = store.issueUserToken("mod_only", "mod@test.com", false, true);
      const modOnlyRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, modOnlyUser.token), store);
      expect(modOnlyRes.status).toBe(403);

      // 7. Age-verified moderator user -> 200
      const fullModUser = store.issueUserToken("full_mod", "mod_full@test.com", true, true);
      const fullModRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, fullModUser.token), store);
      expect(fullModRes.status).toBe(200);
      const listData = await fullModRes.json() as any;
      expect(listData.schemaVersion).toBe(MODERATOR_PROTOCOL_VERSION);
      expect(listData.ratings.length).toBe(1);
      expect(listData.ratings[0].canonicalId).toBe("com.author.pack1");
    } finally {
      store.close();
    }
  });

  test("lists packages with rating filter, pagination and report counts", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const mod = store.issueUserToken("mod_alice", "alice@test.com", true, true);

      // Seed 3 packages
      seedTestPackage(store, "com.pkg.general", "General Package", "general", "tools", "editor");
      seedTestPackage(store, "com.pkg.mature", "Mature Package", "mature", "assets", "textures");
      seedTestPackage(store, "com.pkg.adult", "Adult Package", "adult_restricted", "avatars", "models");

      // Register an app to record a removal report against com.pkg.adult
      const app = store.registerApp({ schemaVersion: 1, appName: "Testing Reporter" });
      await store.recordRemovalReport(app.appId, {
        schemaVersion: 1,
        reportType: "removal_request",
        canonicalId: "com.pkg.adult",
        reason: "Contains adult content elements requiring review"
      });

      // 1. Unfiltered query
      const allRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings", "GET", undefined, mod.token), store);
      expect(allRes.status).toBe(200);
      const allData = ModeratorRatingListResponseSchema.parse(await allRes.json());
      expect(allData.ratings.length).toBe(3);

      // Verify reportCount on com.pkg.adult is 1
      const adultRecord = allData.ratings.find(r => r.canonicalId === "com.pkg.adult");
      expect(adultRecord).toBeDefined();
      expect(adultRecord?.reportCount).toBe(1);

      // Verify reportCount on com.pkg.general is 0
      const genRecord = allData.ratings.find(r => r.canonicalId === "com.pkg.general");
      expect(genRecord?.reportCount).toBe(0);

      // 2. Filtered by rating: ?rating=adult_restricted
      const adultOnlyRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings?rating=adult_restricted", "GET", undefined, mod.token), store);
      expect(adultOnlyRes.status).toBe(200);
      const adultOnlyData = ModeratorRatingListResponseSchema.parse(await adultOnlyRes.json());
      expect(adultOnlyData.ratings.length).toBe(1);
      expect(adultOnlyData.ratings[0]?.canonicalId).toBe("com.pkg.adult");

      // 3. Pagination with limit=1
      const page1Res = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings?limit=1", "GET", undefined, mod.token), store);
      expect(page1Res.status).toBe(200);
      const page1Data = ModeratorRatingListResponseSchema.parse(await page1Res.json());
      expect(page1Data.ratings.length).toBe(1);
      expect(page1Data.nextCursor).not.toBeNull();

      // Page 2 using nextCursor
      const page2Res = await handleModeratorRequest(
        jsonRequest(`/v1/moderator/ratings?limit=1&cursor=${page1Data.nextCursor}`, "GET", undefined, mod.token),
        store
      );
      expect(page2Res.status).toBe(200);
      const page2Data = ModeratorRatingListResponseSchema.parse(await page2Res.json());
      expect(page2Data.ratings.length).toBe(1);
      expect(page2Data.ratings[0]?.canonicalId).not.toBe(page1Data.ratings[0]?.canonicalId);

      // 4. Invalid limit query -> 400
      const badLimitRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings?limit=0", "GET", undefined, mod.token), store);
      expect(badLimitRes.status).toBe(400);

      // 5. Invalid cursor query -> 400
      const badCursorRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings?cursor=invalid!cursor", "GET", undefined, mod.token), store);
      expect(badCursorRes.status).toBe(400);

      // 6. Duplicate search params -> 400
      const duplicateRes = await handleModeratorRequest(jsonRequest("/v1/moderator/ratings?limit=5&limit=10", "GET", undefined, mod.token), store);
      expect(duplicateRes.status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("adjusts canonical package content rating with audit trail", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const mod = store.issueUserToken("mod_bob", "bob@test.com", true, true);

      seedTestPackage(store, "com.creator.avatar", "Sample Avatar", "adult_restricted", "avatars", "models");

      // 1. Non-existent package -> 404
      const notFoundRes = await handleModeratorRequest(jsonRequest(
        "/v1/moderator/ratings/com.nonexistent.package",
        "POST",
        {
          schemaVersion: 1,
          newRating: "mature",
          reason: "Package verified safe for mature"
        },
        mod.token
      ), store);
      expect(notFoundRes.status).toBe(404);

      // 2. Invalid payload (missing reason) -> 400
      const badBodyRes = await handleModeratorRequest(jsonRequest(
        "/v1/moderator/ratings/com.creator.avatar",
        "POST",
        {
          schemaVersion: 1,
          newRating: "mature"
        },
        mod.token
      ), store);
      expect(badBodyRes.status).toBe(400);

      // 3. Invalid content-type (not json) -> 415
      const badTypeRes = await handleModeratorRequest(new Request(
        "http://127.0.0.1:3737/v1/moderator/ratings/com.creator.avatar",
        {
          method: "POST",
          headers: {
            "authorization": `Bearer ${mod.token}`,
            "content-type": "text/plain"
          },
          body: "raw string"
        }
      ), store);
      expect(badTypeRes.status).toBe(415);

      // 4. Successful adjustment: adult_restricted -> mature
      const adjustRes = await handleModeratorRequest(jsonRequest(
        "/v1/moderator/ratings/com.creator.avatar",
        "POST",
        {
          schemaVersion: 1,
          newRating: "mature",
          reason: "Resolved false positive rating claim after inspection"
        },
        mod.token
      ), store);
      expect(adjustRes.status).toBe(200);
      const adjustData = SetRatingAdjustmentResponseSchema.parse(await adjustRes.json());
      expect(adjustData.schemaVersion).toBe(MODERATOR_PROTOCOL_VERSION);
      expect(adjustData.canonicalId).toBe("com.creator.avatar");
      expect(adjustData.previousRating).toBe("adult_restricted");
      expect(adjustData.newRating).toBe("mature");
      expect(adjustData.adjustedBy).toBe(mod.userId);

      // 5. Verify database reflection
      const checkRow = store.db.prepare("SELECT content_rating FROM canonical_packages WHERE canonical_id=?")
        .get("com.creator.avatar") as any;
      expect(checkRow.content_rating).toBe("mature");

      // 6. Adjustment to prohibited
      const prohibitRes = await handleModeratorRequest(jsonRequest(
        "/v1/moderator/ratings/com.creator.avatar",
        "POST",
        {
          schemaVersion: 1,
          newRating: "prohibited",
          reason: "Malicious prohibited content detected"
        },
        mod.token
      ), store);
      expect(prohibitRes.status).toBe(200);
      const prohibitData = SetRatingAdjustmentResponseSchema.parse(await prohibitRes.json());
      expect(prohibitData.previousRating).toBe("mature");
      expect(prohibitData.newRating).toBe("prohibited");

      // Check public catalog excludes prohibited packages
      const publicCatalog = await store.listCanonicalPackagesPage(10, null);
      expect(publicCatalog.packages.some(p => p.canonicalId === "com.creator.avatar")).toBe(false);
    } finally {
      store.close();
    }
  });

  test("createModeratorHandler delegates only /v1/moderator/* paths", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const handler = createModeratorHandler(store);

      // Non-moderator path returns null
      const nonMod = await handler(new Request("http://127.0.0.1:3737/v1/operator/leads"));
      expect(nonMod).toBeNull();

      // Moderator path returns Response
      const mod = await handler(new Request("http://127.0.0.1:3737/v1/moderator/ratings"));
      expect(mod).not.toBeNull();
      expect(mod?.status).toBe(401);
    } finally {
      store.close();
    }
  });

  test("allows age-verified moderator to list and review intensive-use app candidates (R54-C38A2)", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const devUser = store.issueUserToken("app-developer");
      const app = store.registerApp({ schemaVersion: 1, appName: "Candidate App" }, devUser.userId);

      // Simulate app reaching intensive-use threshold
      for (let i = 0; i < 50; i++) {
        store.recordAppActivity(app.appId);
      }

      // Age-verified moderator
      const mod = store.issueUserToken("mod-adult", "mod@example.com", true, true);
      // Non-moderator user
      const regularUser = store.issueUserToken("regular-user", "reg@example.com", true, false);
      // Moderator lacking age verification
      const unverifiedMod = store.issueUserToken("mod-unverified", "mod2@example.com", false, true);

      // 1. Non-moderator cannot list candidate apps
      const regRes = await handleModeratorRequest(jsonRequest("/v1/moderator/apps", "GET", undefined, regularUser.token), store);
      expect(regRes.status).toBe(403);

      // 2. Unverified moderator cannot list candidate apps
      const unverRes = await handleModeratorRequest(jsonRequest("/v1/moderator/apps", "GET", undefined, unverifiedMod.token), store);
      expect(unverRes.status).toBe(403);

      // 3. Verified moderator lists candidate apps
      const listRes = await handleModeratorRequest(jsonRequest("/v1/moderator/apps?candidateStatus=review_pending", "GET", undefined, mod.token), store);
      expect(listRes.status).toBe(200);
      const listData = ModeratorAppListResponseSchema.parse(await listRes.json());
      expect(listData.apps).toHaveLength(1);
      expect(listData.apps[0].appId).toBe(app.appId);
      expect(listData.apps[0].candidateStatus).toBe("review_pending");
      expect(listData.apps[0].candidateFlags).toContain("intensive_usage");

      // 4. Verified moderator reviews app candidate and grants delegation
      const reviewRes = await handleModeratorRequest(jsonRequest(
        `/v1/moderator/apps/${app.appId}/candidate-review`,
        "POST",
        {
          schemaVersion: 1,
          candidateStatus: "trusted",
          grantDelegation: true,
          notes: "Approved by moderator"
        },
        mod.token
      ), store);
      expect(reviewRes.status).toBe(200);
      const reviewData = ModeratorReviewAppCandidateResponseSchema.parse(await reviewRes.json());
      expect(reviewData.candidateStatus).toBe("trusted");
      expect(reviewData.delegationAllowed).toBe(true);
      expect(reviewData.permissions).toContain("claims:delegate");

      // Verify in DB
      const row = store.db.prepare("SELECT candidate_status, permissions_json FROM registered_apps WHERE app_id = ?").get(app.appId) as any;
      expect(row.candidate_status).toBe("trusted");
      expect(JSON.parse(row.permissions_json)).toContain("claims:delegate");

      // 5. Non-moderator cannot submit review
      const regReviewRes = await handleModeratorRequest(jsonRequest(
        `/v1/moderator/apps/${app.appId}/candidate-review`,
        "POST",
        {
          schemaVersion: 1,
          candidateStatus: "none"
        },
        regularUser.token
      ), store);
      expect(regReviewRes.status).toBe(403);

      // 6. Unknown app returns 404
      const unknownRes = await handleModeratorRequest(jsonRequest(
        "/v1/moderator/apps/00000000-0000-4000-8000-000000000000/candidate-review",
        "POST",
        {
          schemaVersion: 1,
          candidateStatus: "trusted"
        },
        mod.token
      ), store);
      expect(unknownRes.status).toBe(404);
    } finally {
      store.close();
    }
  });
});
