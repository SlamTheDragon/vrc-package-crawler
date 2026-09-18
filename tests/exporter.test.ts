import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { runDatabaseExport } from "../src/exporter.ts";

describe("Exportable Database Generator & FTS5 Indexing", () => {
  const testCatalogPath = path.resolve(process.cwd(), "test_vrc_catalog.db");

  it("exports catalog into standalone SQLite database with working FTS5", async () => {
    if (fs.existsSync(testCatalogPath)) {
      fs.unlinkSync(testCatalogPath);
    }

    const exportedPath = await runDatabaseExport("catalog", "test_vrc_catalog.db");
    expect(fs.existsSync(exportedPath)).toBe(true);

    const testDb = new Database(exportedPath);

    // Verify tables exist
    const tables = testDb.query("SELECT name FROM sqlite_master WHERE type='table';").all().map((r: any) => r.name);
    expect(tables).toContain("canonical_packages_v2");
    expect(tables).toContain("package_fronts_v2");
    expect(tables).toContain("packages_fts");

    // Verify packages exist
    const pkgCount = (testDb.query("SELECT COUNT(*) as c FROM canonical_packages_v2;").get() as any).c;
    expect(pkgCount).toBeGreaterThan(0);

    // Verify FTS5 query
    const ftsResults = testDb.query("SELECT name, author FROM packages_fts WHERE packages_fts MATCH 'avatar' LIMIT 5;").all() as any[];
    expect(Array.isArray(ftsResults)).toBe(true);

    testDb.close();

    // Clean up on Windows after brief handle release
    await new Promise(r => setTimeout(r, 200));
    try {
      fs.unlinkSync(exportedPath);
    } catch (_) {}
  });
});
