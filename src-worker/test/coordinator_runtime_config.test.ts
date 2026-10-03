import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { initializeCoordinatorConfig, loadCoordinatorRuntimeConfig } from "../../src-web/tests/support/runtime_config.js";
import { getTestOutputDir } from "../../src-web/tests/helpers/test_directory.js";

const tempRoot = getTestOutputDir();
function fixtureDirectory(): string { return mkdtempSync(join(tempRoot, "vrc-coordinator-config-")); }
function removeFixtureDirectory(directory: string): void {
  if (!realpathSync(directory).startsWith(tempRoot + sep)) throw new Error("Unexpected config fixture path");
  rmSync(directory, { recursive: true, force: true });
}

describe("local coordinator runtime configuration", () => {
  test("creates a non-secret working-directory config once and resolves its database there", () => {
    const directory = fixtureDirectory();
    try {
      const path = initializeCoordinatorConfig(directory, 9876);
      const saved = readFileSync(path, "utf8");
      expect(JSON.parse(saved)).toEqual({ schemaVersion: 1, databaseFile: "coordinator.db", listenPort: 9876 });
      expect(saved).not.toContain("operatorToken");
      expect(loadCoordinatorRuntimeConfig(directory, { COORDINATOR_DB_PATH: "ignored.db" })).toEqual({
        databasePath: join(directory, "coordinator.db"), listenPort: 9876
      });
      expect(() => initializeCoordinatorConfig(directory, 8787)).toThrow();
      expect(readFileSync(path, "utf8")).toBe(saved);
    } finally { removeFixtureDirectory(directory); }
  });

  test("preserves the old explicit database path only when no config exists", () => {
    const directory = fixtureDirectory();
    try {
      expect(loadCoordinatorRuntimeConfig(directory, { COORDINATOR_DB_PATH: "fixture.db" })).toEqual({
        databasePath: "fixture.db", listenPort: 8787
      });
      expect(() => loadCoordinatorRuntimeConfig(directory, { COORDINATOR_DB_PATH: "fixture.db",
        COORDINATOR_CONFIG_PATH: "missing.json" })).toThrow("config");
    } finally { removeFixtureDirectory(directory); }
  });

  test("malformed or unsafe config fails closed instead of opening the environment database", () => {
    const directory = fixtureDirectory();
    const file = join(directory, "coordinator.config.json");
    try {
      for (const body of [
        { schemaVersion: 2, databaseFile: "coordinator.db", listenPort: 8787 },
        { schemaVersion: 1, databaseFile: "../outside.db", listenPort: 8787 },
        { schemaVersion: 1, databaseFile: "coordinator.db", listenPort: 0 },
        { schemaVersion: 1, databaseFile: "coordinator.db", listenPort: 8787, operatorToken: "secret" }
      ]) {
        writeFileSync(file, JSON.stringify(body));
        expect(() => loadCoordinatorRuntimeConfig(directory, { COORDINATOR_DB_PATH: "fallback.db" }))
          .toThrow("config");
      }
    } finally { removeFixtureDirectory(directory); }
  });
});
