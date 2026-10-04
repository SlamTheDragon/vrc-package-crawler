import { describe, expect, test } from "bun:test";
import { relative, resolve, sep } from "node:path";
import { readFileSync } from "node:fs";
import { TEST_OUTPUT_DIR } from "./helpers/test_directory.ts";

describe("Worker test artifact ownership", () => {
  test("uses project-local output independent of the process working directory", () => {
    const workerRoot = resolve(import.meta.dir, "..");
    expect(TEST_OUTPUT_DIR).toBe(resolve(workerRoot, "dist/tests"));
    expect(relative(workerRoot, TEST_OUTPUT_DIR)).toBe(`dist${sep}tests`);
    expect(TEST_OUTPUT_DIR).not.toBe(resolve(workerRoot, "../dist/tests"));
  });

  test("loads only Worker-owned test setup", () => {
    const config = Bun.TOML.parse(readFileSync(resolve(import.meta.dir, "../bunfig.toml"), "utf8"));
    expect(config.test.preload).toEqual(["./test/helpers/test_setup.ts"]);
  });
});
