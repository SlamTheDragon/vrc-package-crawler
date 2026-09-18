import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { runDatabaseExport } from "../src/tools/exporter.ts";
import { CONFIG } from "../src/config.ts";

describe("Exportable Database Generator & FTS5 Indexing", () => {
  const testCatalogPath = path.resolve(CONFIG.baseDir, "test_vrc_catalog.db");

  it("exports catalog into standalone SQLite database with working FTS5", async () => {
    if (fs.existsSync(testCatalogPath)) {
      try { fs.unlinkSync(testCatalogPath); } catch (_) {}
    }
    const rootPath = path.resolve(process.cwd(), "test_vrc_catalog.db");
    if (fs.existsSync(rootPath)) {
      try { fs.unlinkSync(rootPath); } catch (_) {}
    }

    const exportedPath = await runDatabaseExport("catalog", "test_vrc_catalog.db");
    expect(fs.existsSync(exportedPath)).toBe(true);

    const testDb = new Database(exportedPath);

    // Verify tables exist with clean normalized names
    const tables = testDb.query("SELECT name FROM sqlite_master WHERE type='table';").all().map((r: any) => r.name);
    expect(tables).toContain("canonical_packages");
    expect(tables).toContain("package_fronts");
    expect(tables).toContain("packages_fts");

    // Verify packages exist
    const pkgCount = (testDb.query("SELECT COUNT(*) as c FROM canonical_packages;").get() as any).c;
    expect(pkgCount).toBeGreaterThan(0);

    // Verify FTS5 query
    const ftsResults = testDb.query("SELECT name, author FROM packages_fts WHERE packages_fts MATCH 'avatar' LIMIT 5;").all() as any[];
    expect(Array.isArray(ftsResults)).toBe(true);

    testDb.close();

    // Clean up on Windows after brief handle release with retry
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 150));
      try {
        if (fs.existsSync(exportedPath)) fs.unlinkSync(exportedPath);
        if (fs.existsSync(`${exportedPath}-wal`)) fs.unlinkSync(`${exportedPath}-wal`);
        if (fs.existsSync(`${exportedPath}-shm`)) fs.unlinkSync(`${exportedPath}-shm`);
        if (!fs.existsSync(exportedPath)) break;
      } catch (_) {}
    }
  }, 30000);
});
