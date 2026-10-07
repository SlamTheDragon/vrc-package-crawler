import { expect, test } from "bun:test";
import { setup, setupProjects } from "../scripts/setup.mjs";

test("setupProjects includes root and all product directories", () => {
  expect(setupProjects.root).toBe(".");
  expect(setupProjects.crawler).toBe("src-crawler");
  expect(setupProjects["crawler-client"]).toBe("src-crawler-client");
  expect(setupProjects.package).toBe("src-package");
  expect(setupProjects.web).toBe("src-web");
  expect(setupProjects.worker).toBe("src-worker");
  expect(setupProjects.network).toBe("src-worker/packages/network");
});

test("setup executes bun install --no-save --ignore-scripts across selected targets", async () => {
  const executed: { cmd: string; args: string[]; cwd: string }[] = [];
  const fakeExec = (cmd: string, args: string[], options: any) => {
    executed.push({ cmd, args, cwd: options.cwd });
    return "";
  };

  // Test setup("root")
  await setup("root", { exec: fakeExec as any, quiet: true });
  expect(executed.length).toBe(1);
  expect(executed[0].cmd).toBe("bun");
  expect(executed[0].args).toEqual(["install", "--no-save", "--ignore-scripts"]);

  // Test setup("all")
  executed.length = 0;
  await setup("all", { exec: fakeExec as any, quiet: true });
  // Should have executed for all 7 projects
  expect(executed.length).toBe(7);
  expect(executed.every(e => e.cmd === "bun")).toBe(true);
  expect(executed.every(e => e.args.join(" ") === "install --no-save --ignore-scripts")).toBe(true);
});

test("setup throws on unknown product target", async () => {
  await expect(setup("invalid-target" as any, { quiet: true })).rejects.toThrow("Unknown project: \"invalid-target\"");
});
