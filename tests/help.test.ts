import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import {
  categories,
  manualProcedures,
  renderHelpOverview,
  renderCategoryHelp,
  renderManualProcedures,
  getHelpOverviewLines,
  getCategoryHelpLines,
  getManualProceduresLines,
  pageLines
} from "../scripts/help.mjs";

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

test("getHelpOverviewLines returns formatted lines for all categories", () => {
  const lines = getHelpOverviewLines();
  expect(lines.length).toBeGreaterThanOrEqual(80);
  expect(lines.some(l => l.includes("VRCP Monorepo CLI Reference"))).toBe(true);
  expect(lines.some(l => l.includes("Setup & Onboarding"))).toBe(true);
  expect(lines.some(l => l.includes("Publication & Release"))).toBe(true);
});

test("getCategoryHelpLines returns category commands or null for unknown", () => {
  const publishLines = getCategoryHelpLines("publish");
  expect(publishLines).not.toBeNull();
  expect(publishLines!.some(l => l.includes("Publication & Release"))).toBe(true);
  expect(getCategoryHelpLines("unknown-category")).toBeNull();
});

test("getManualProceduresLines returns all manual operator steps", () => {
  const lines = getManualProceduresLines();
  expect(lines.length).toBeGreaterThanOrEqual(30);
  expect(lines.some(l => l.includes("Unhandled & Manual Procedures"))).toBe(true);
});

test("pageLines writes all lines directly when interactive is false", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", chunk => { text += chunk.toString(); });

  const lines = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
  await pageLines(lines, { input, output, interactive: false, rows: 4 });

  expect(text).toContain("Line 1\n");
  expect(text).toContain("Line 5\n");
});

test("pageLines outputs without prompt when all lines fit in page size", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", chunk => { text += chunk.toString(); });

  const lines = ["Alpha", "Beta"];
  await pageLines(lines, { input, output, interactive: true, rows: 20 });

  expect(text).toContain("Alpha\n");
  expect(text).toContain("Beta\n");
  expect(text).not.toContain("More");
});

test("pageLines rolling enter key advances line by line", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", chunk => { text += chunk.toString(); });

  const lines = ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"];
  const promise = pageLines(lines, { input, output, interactive: true, rows: 6 });

  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Item 1\n");
  expect(text).toContain("Item 3\n");
  expect(text).not.toContain("Item 4\n");

  input.write("\r");
  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Item 4\n");
  expect(text).not.toContain("Item 5\n");

  input.write("\n");
  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Item 5\n");

  input.write("\r");
  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Item 6\n");

  await promise;
});

test("pageLines space key advances a full page", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", chunk => { text += chunk.toString(); });

  const lines = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6", "Line 7", "Line 8"];
  const promise = pageLines(lines, { input, output, interactive: true, rows: 6 });

  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Line 3\n");
  expect(text).not.toContain("Line 4\n");

  input.write(" ");
  await new Promise(r => setTimeout(r, 10));
  expect(text).toContain("Line 6\n");
  expect(text).not.toContain("Line 7\n");

  input.write(" ");
  await promise;
  expect(text).toContain("Line 8\n");
});

test("pageLines q key terminates paging early", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", chunk => { text += chunk.toString(); });

  const lines = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];
  const promise = pageLines(lines, { input, output, interactive: true, rows: 6 });

  await new Promise(r => setTimeout(r, 10));
  expect(text).not.toContain("Fourth\n");

  input.write("q");
  await promise;

  expect(text).not.toContain("Fourth\n");
  expect(text).not.toContain("Sixth\n");
});
