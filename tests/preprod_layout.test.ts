import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Pre-production directory layout and configuration conformance", () => {
  const rootDir = join(import.meta.dir, "..");

  test("contains required directories in pre-production architecture", () => {
    const requiredDirs = [
      ".agents",
      "src-web",
      "src-crawler",
      "src-package",
      "docs",
      "docs/scratch",
      "docs/research",
      "docs/source",
    ];

    for (const dir of requiredDirs) {
      expect(existsSync(join(rootDir, dir))).toBe(true);
    }
  });

  test("contains required governance and operator documents with minimal scratch footprint", () => {
    const requiredFiles = [
      "AGENTS.md",
      "DELEGATES.md",
      "LEGAL.md",
      "LICENSE.md",
      "README.md",
      "docs/scratch/IMPLEMENTATION_PLAN.md",
      "docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md",
      "docs/scratch/task_tracker.md",
      "src-crawler/config.json",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(rootDir, file))).toBe(true);
    }
  });

  test("src-crawler/config.json conforms to protocol version 1 and specifies dual database/config targets", () => {
    const configPath = join(rootDir, "src-crawler", "config.json");
    const raw = JSON.parse(readFileSync(configPath, "utf8"));

    expect(raw.protocol.version).toBe(1);
    expect(raw.databaseFiles.coordinator).toBe("coordinator.db");
    expect(raw.databaseFiles.node).toBe("node.db");
    expect(raw.configFiles.coordinator).toBe("coordinator.config.json");
    expect(raw.configFiles.node).toBe("node.config.json");
    expect(raw.platforms).toContain("vpm");
    expect(raw.platforms).toContain("github");
  });

  test("worker, node, and package SDK implementation entry points exist", () => {
    expect(existsSync(join(rootDir, "src-web", "src", "worker", "worker_entry.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler", "src", "worker", "worker_entry.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler", "src", "main.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler", "src", "worker", "main.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-package", "src", "index.ts"))).toBe(true);
  });

  test("runtime implementation and integration tests have separate owners without old forwarding files", () => {
    expect(existsSync(join(rootDir, "src-crawler/src/node/main.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler/src/node/index.ts"))).toBe(false);
    for (const path of ["client/node_client.ts", "runner/daemon.ts", "storage/local_sqlite.ts",
      "adapters/observation_adapter.ts", "config/runtime_config.ts"]) {
      expect(existsSync(join(rootDir, "src-crawler/src", path))).toBe(true);
    }
    for (const file of ["main.ts", "handler.ts", "operator_handler.ts", "index.ts", "local_sqlite.ts",
      "runtime_config.ts", "robots_refresh_service.ts"]) {
      expect(existsSync(join(rootDir, "src-web/src/worker", file))).toBe(false);
    }
    expect(existsSync(join(rootDir, "src-web/src/worker/storage/local_sqlite.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-web/tests/support/local_sqlite.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-web/tests/worker/d1_coordinator_store.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-web/tests/integration/node_daemon.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler/tests/d1_coordinator_store.test.ts"))).toBe(false);
    expect(readFileSync(join(rootDir, "src-crawler/src/index.ts"), "utf8")).not.toContain("worker/");
  });

  test("src-web config serves the API entry with a local-only D1 binding and no static assets", () => {
    const config = Bun.TOML.parse(readFileSync(join(rootDir, "src-web", "wrangler.toml"), "utf8"));
    expect(config.main).toBe("src/worker/worker_entry.ts");
    expect(config.assets).toBeUndefined();
    expect(config.compatibility_flags).toContain("nodejs_compat");
    const databases = config.d1_databases as { binding: string; database_id: string; remote?: boolean }[];
    expect(databases).toHaveLength(1);
    expect(databases[0].binding).toBe("DB");
    expect(databases[0].database_id).toBe("722bdd0d-92ca-445b-9319-da0b27adf7b2");
    expect(databases[0].remote).not.toBe(true);
    expect(existsSync(join(rootDir, "src-crawler", "wrangler.toml"))).toBe(false);
  });
});
