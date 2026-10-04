import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("crawler test setup and typecheck include only crawler-owned paths", () => {
  const root = resolve(import.meta.dir, "..");
  const config = Bun.TOML.parse(readFileSync(resolve(root, "bunfig.toml"), "utf8"));
  expect(config).toMatchObject({ test: { preload: ["./tests/test_setup.ts"] } });
  const types = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8"));
  expect(types.include).toEqual(["**/*"]);
});
