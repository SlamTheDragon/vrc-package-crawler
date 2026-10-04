import { mkdirSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export const TEST_OUTPUT_DIR = resolve(import.meta.dir, "../../dist/tests");

export function getTestOutputDir(): string {
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  return realpathSync(TEST_OUTPUT_DIR);
}
