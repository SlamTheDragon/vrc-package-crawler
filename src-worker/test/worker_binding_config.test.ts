import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("default and Preview D1 declarations expose the runtime binding without sharing IDs", () => {
  const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const declarations = [...config.matchAll(
    /\[\[(previews\.)?d1_databases\]\]\s+binding\s*=\s*"([^"]+)"\s+database_id\s*=\s*"([^"]+)"/g
  )];
  expect(declarations).toHaveLength(2);
  expect(declarations.map(match => match[2])).toEqual(["VRCP_D1", "VRCP_D1"]);
  expect(declarations.map(match => Boolean(match[1]))).toEqual([false, true]);
  expect(declarations[0]?.[3]).not.toBe(declarations[1]?.[3]);
  expect(config).not.toContain('binding = "VRCP_PREVIEW_D1"');
});
