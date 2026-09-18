import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { db } from "../src/db.ts";
import { processPendingReports, pullReportsFromDirectory } from "../src/tools/steering.ts";

describe("Autonomous Steering Engine (5 Discrete Branches & Pull-Based Ingestion)", () => {
  const testPkgId = `test_steering_pkg_${Date.now()}`;
  const testCanonicalId = `test-steering-tool-${Date.now()}`;
  const now = new Date().toISOString();

  beforeAll(() => {
    // Seed test canonical package and entity
    db.rawDb.run(`
      INSERT OR REPLACE INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, lifecycle, created_at, updated_at
      ) VALUES (
        ?, ?, 'Original Tool Name', 'SteeringAuthor', '["SteeringAuthor"]',
        'Avatars', 'Avatars / Accessories', 'Asset Additive',
        'Original Description', 'booth', '["booth"]', 'https://booth.pm/items/999999',
        'JPY', 1000, 0, '["avatar","accessory"]', '{}', '["booth:999999"]', 'published', ?, ?
      );
    `, [testPkgId, testCanonicalId, now, now]);

    db.rawDb.run(`
      INSERT OR REPLACE INTO entities (
        id, platform, url, title, author, is_quarantined, observed_at, created_at, updated_at
      ) VALUES (
        'booth:999999', 'booth', 'https://booth.pm/items/999999',
        'Original Tool Name', 'SteeringAuthor', 0, ?, ?, ?
      );
    `, [now, now, now]);
  });

  afterAll(() => {
    // Cleanup test data
    db.rawDb.run("DELETE FROM canonical_packages WHERE canonical_id = ? OR canonical_id LIKE 'test-%';", [testCanonicalId]);
    db.rawDb.run("DELETE FROM entities WHERE id = 'booth:999999' OR id LIKE 'test_%';");
    db.rawDb.run("DELETE FROM curator_overrides WHERE canonical_id = ? OR canonical_id LIKE 'test-%';", [testCanonicalId]);
    db.rawDb.run("DELETE FROM user_reports WHERE target_package_id = ? OR target_package_id LIKE 'test-%' OR report_id LIKE 'rep_%';", [testCanonicalId]);
    db.rawDb.run("DELETE FROM search_patterns WHERE query = 'avatar rigging optimizer' OR query = 'Original Tool Name' OR query LIKE 'test%' OR query LIKE '%osc-dance-framework%';");
  });

  it("processes BRANCH_CATEGORIZATION: updates overrides and immediate canonical projection", async () => {
    const reportId = `rep_cat_${Date.now()}`;
    db.insertReport({
      reportId,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "categorization",
      branchPayload: {
        suggestedClass: "Tools & Utilities",
        suggestedSubcategory: "Avatars / Setup & Optimization"
      }
    });

    const res = await processPendingReports();
    expect(res.applied).toBeGreaterThan(0);

    // Check report status
    const report = db.rawDb.prepare("SELECT * FROM user_reports WHERE report_id = ?;").get(reportId) as any;
    expect(report.status).toBe("applied");
    expect(report.applied_at).toBeTruthy();

    // Check curator override
    const override = db.getCuratorOverride(testCanonicalId);
    expect(override).toBeDefined();
    expect(override!.category_override).toBe("Tools & Utilities");
    expect(override!.subcategory_override).toBe("Avatars / Setup & Optimization");

    // Check immediate projection update
    const updatedPkg = db.rawDb.prepare("SELECT category, subcategory FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
    expect(updatedPkg.category).toBe("Tools & Utilities");
    expect(updatedPkg.subcategory).toBe("Avatars / Setup & Optimization");
  });

  it("processes BRANCH_LISTING: updates name, description, and canonical URL", async () => {
    const reportId = `rep_list_${Date.now()}`;
    const newName = "Optimized Tool Deluxe";
    const newDesc = "Updated full description for the tool.";

    db.insertReport({
      reportId,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "listing",
      branchPayload: {
        nameOverride: newName,
        correctedDescription: newDesc
      }
    });

    await processPendingReports();

    const override = db.getCuratorOverride(testCanonicalId);
    expect(override!.name_override).toBe(newName);
    expect(override!.description_override).toBe(newDesc);

    const updatedPkg = db.rawDb.prepare("SELECT name, description FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
    expect(updatedPkg.name).toBe(newName);
    expect(updatedPkg.description).toBe(newDesc);
  });

  it("processes BRANCH_TAGS: adds new tags and removes unwanted tags", async () => {
    const reportId = `rep_tags_${Date.now()}`;
    db.insertReport({
      reportId,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "tags",
      branchPayload: {
        addTags: ["vrcfury", "non-destructive"],
        removeTags: ["accessory"]
      }
    });

    await processPendingReports();

    const override = db.getCuratorOverride(testCanonicalId);
    expect(override!.added_tags_json).toContain("vrcfury");
    expect(override!.removed_tags_json).toContain("accessory");

    const updatedPkg = db.rawDb.prepare("SELECT tags_json FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
    const tags: string[] = JSON.parse(updatedPkg.tags_json);
    expect(tags).toContain("vrcfury");
    expect(tags).toContain("non-destructive");
    expect(tags).not.toContain("accessory");
  });

  it("processes BRANCH_DISCOVERY_QUERY: enqueues high-priority seeds and search patterns", async () => {
    const reportId = `rep_disc_${Date.now()}`;
    const seedUrl = `https://github.com/vrc-community/discovered-repo-${Date.now()}`;

    db.insertReport({
      reportId,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "discovery_query",
      branchPayload: {
        searchQuery: "avatar rigging optimizer",
        queryIntent: "rigging utilities",
        relevanceVote: "boost",
        negativeTokens: ["clothing-only", "dress-mesh"],
        suggestedSeeds: [seedUrl]
      }
    });

    await processPendingReports();

    // Check search patterns table
    const patterns = db.getSearchPatterns();
    const matched = patterns.find(p => p.query === "avatar rigging optimizer");
    expect(matched).toBeDefined();
    expect(matched!.relevance_vote).toBe("boost");
    expect(matched!.negative_tokens_json).toContain("clothing-only");

    // Check seed in frontier
    const frontierRow = db.rawDb.prepare("SELECT * FROM frontier WHERE url = ?;").get(seedUrl) as any;
    expect(frontierRow).toBeDefined();
    expect(frontierRow.priority).toBe(100);
    expect(frontierRow.platform).toBe("github");

    // Clean up frontier
    db.rawDb.run("DELETE FROM frontier WHERE url = ?;", [seedUrl]);
  });

  it("processes BRANCH_IRRELEVANCE: flags package as delisted, quarantines observation, registers negative pattern", async () => {
    const reportId = `rep_irr_${Date.now()}`;
    db.insertReport({
      reportId,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "irrelevance",
      branchPayload: {
        irrelevanceReason: "cosmetics_only",
        negativeTokens: ["cosmetic-prop", "doll-dress"]
      }
    });

    await processPendingReports();

    // Check lifecycle on canonical package
    const pkg = db.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
    expect(pkg.lifecycle).toBe("delisted");

    // Check quarantine flag on observation
    const entity = db.rawDb.prepare("SELECT is_quarantined FROM entities WHERE id = 'booth:999999';").get() as any;
    expect(entity.is_quarantined).toBe(1);

    // Check search patterns table has suppress rule
    const patterns = db.getSearchPatterns();
    const suppressPattern = patterns.find(p => p.relevance_vote === "suppress" && p.negative_tokens_json.includes("cosmetic-prop"));
    expect(suppressPattern).toBeDefined();
  });

  it("pulls pending reports from filesystem/R2 bucket directory and archives to processed/", async () => {
    const tempDir = path.resolve(process.cwd(), `test_reports_${Date.now()}`);
    const pendingDir = path.join(tempDir, "pending");
    const processedDir = path.join(tempDir, "processed");
    fs.mkdirSync(pendingDir, { recursive: true });

    const reportFile = path.join(pendingDir, "report_001.json");
    const reportContent = {
      reportId: `rep_pull_${Date.now()}`,
      targetPackageId: testCanonicalId,
      targetPackageName: "Original Tool Name",
      branch: "listing",
      submittedAt: new Date().toISOString(),
      branchPayload: {
        nameOverride: "Pulled Report Tool Name"
      }
    };
    fs.writeFileSync(reportFile, JSON.stringify(reportContent), "utf-8");

    const pulledCount = await pullReportsFromDirectory(tempDir);
    expect(pulledCount).toBe(1);

    // Verify file moved to processed
    expect(fs.existsSync(reportFile)).toBe(false);
    expect(fs.existsSync(path.join(processedDir, "report_001.json"))).toBe(true);

    // Verify report in DB
    const reportInDb = db.rawDb.prepare("SELECT * FROM user_reports WHERE report_id = ?;").get(reportContent.reportId) as any;
    expect(reportInDb).toBeDefined();
    expect(reportInDb.client_fingerprint).toBe("r2-pull-sync");

    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
