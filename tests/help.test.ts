import { expect, test } from "bun:test";
import { categories, manualProcedures, renderHelpOverview, renderCategoryHelp, renderManualProcedures } from "../scripts/help.mjs";

test("categories contains all 8 monorepo command domains", () => {
  const keys = Object.keys(categories);
  expect(keys).toContain("setup");
  expect(keys).toContain("build");
  expect(keys).toContain("test");
  expect(keys).toContain("publish");
  expect(keys).toContain("recovery");
  expect(keys).toContain("sync");
  expect(keys).toContain("clean");
  expect(keys).toContain("infra");
});

test("publish category documents preview, release, status, check, diagnose and retry", () => {
  const commands = categories.publish.commands.map(c => c.cmd);
  expect(commands.some(c => c.includes("publish:preview"))).toBe(true);
  expect(commands.some(c => c.includes("publish:release"))).toBe(true);
  expect(commands.some(c => c.includes("publish:finalize"))).toBe(true);
  expect(commands.some(c => c.includes("publish:status"))).toBe(true);
  expect(commands.some(c => c.includes("publish:check"))).toBe(true);
  expect(commands.some(c => c.includes("publish:diagnose"))).toBe(true);
});

test("manualProcedures lists unhandled procedures requiring manual operator action", () => {
  expect(manualProcedures.length).toBeGreaterThanOrEqual(4);
  const titles = manualProcedures.map(p => p.name);
  expect(titles.some(t => t.includes("Approvals"))).toBe(true);
  expect(titles.some(t => t.includes("Pull Request"))).toBe(true);
  expect(titles.some(t => t.includes("Discord Webhook"))).toBe(true);
  expect(titles.some(t => t.includes("Tag Deletion"))).toBe(true);
});

test("render functions execute without error", () => {
  expect(() => renderHelpOverview()).not.toThrow();
  expect(() => renderCategoryHelp("publish")).not.toThrow();
  expect(() => renderManualProcedures()).not.toThrow();
});
