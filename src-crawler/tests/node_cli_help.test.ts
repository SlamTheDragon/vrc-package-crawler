import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { PlatformSchema } from "../src/shared/protocol/node_protocol.ts";

test("node setup help reflects schema capabilities and Worker registration", () => {
  const result = Bun.spawnSync([process.execPath, "run", "src/main.ts", "--help"], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, GITHUB_TOKEN: "test-help-placeholder", GH_TOKEN: "", NODE_TOKEN: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new TextDecoder().decode(result.stdout);
  expect(result.exitCode).toBe(0);
  expect(output).toContain(`Supported platforms: ${PlatformSchema.options.join(", ")}`);
  expect(output).toContain(`Default: all supported platforms (${PlatformSchema.options.join(",")})`);
  expect(output).toContain("/v1/operator/nodes");
  expect(output).not.toContain("vrc-coordinator register");
});
