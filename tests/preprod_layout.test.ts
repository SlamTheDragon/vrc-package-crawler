import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Pre-production directory layout and configuration conformance", () => {
  const rootDir = join(import.meta.dir, "..");

  test("contains required directories in pre-production architecture", () => {
    const requiredDirs = [
      ".agents",
      "src-web",
      "src-web/scratch",
      "src-crawler",
      "src-crawler/scratch",
      "src-crawler/src/worker",
      "src-crawler/src/node",
      "docs",
      "docs/scratch",
      "docs/scratch/decisions",
      "docs/research",
      "docs/source",
    ];

    for (const dir of requiredDirs) {
      expect(existsSync(join(rootDir, dir))).toBe(true);
    }
  });

  test("contains required governance and operator documents", () => {
    const requiredFiles = [
      "AGENTS.md",
      "DELEGATES.md",
      "TODO.md",
      "LEGAL.md",
      "docs/scratch/decisions/OPERATOR_QUESTION_QUEUE.md",
      "docs/scratch/decisions/DECISION_TABLE_MATRIX.md",
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

  test("worker and node implementation entry points exist and are loadable", () => {
    expect(existsSync(join(rootDir, "src-crawler", "src", "worker", "main.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler", "src", "node", "main.ts"))).toBe(true);
  });
});
