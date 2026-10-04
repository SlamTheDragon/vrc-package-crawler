import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedBinary, attachRelease, checkedAssets, checkSourceRun, milestoneNotes, reconcileSDKDrafts } from "../scripts/release-assets.mjs";

const commit = "a".repeat(40);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const selected = { product: "package", version: "2026.10.0-pre", channel: "preview" };

function fixture(files: Record<string, string | Buffer>, inspect: (paths: string[]) => void) {
  const directory = mkdtempSync(join(tmpdir(), "vrcp-release-unit-"));
  try {
    const paths = Object.entries(files).map(([name, bytes]) => { const path = join(directory, name); writeFileSync(path, bytes); return path; });
    inspect(paths);
  } finally { rmSync(directory, { recursive: true }); }
}

test("SDK attachments require original CI bytes and identity, not a build-directory dump", () => {
  const name = "vrc-packages-api-preview-2026.10.0-pre.tgz";
  const bytes = Buffer.from("synthetic unit data, not a release tarball");
  const receipt = { name: "vrc-packages-api-preview", version: selected.version, commit, purpose: "ci-release", sha256: digest(bytes) };
  const files = { [name]: bytes, [`${name}.json`]: JSON.stringify(receipt) };
  fixture(files, paths => {
    expect(checkedAssets(paths, selected, commit, {}, undefined).size).toBe(2);
    expect(() => checkedAssets([...paths, paths[0]], selected, commit, {}, undefined)).toThrow("Duplicate");
    expect(() => checkedAssets(paths.slice(0, 1), selected, commit, {}, undefined)).toThrow("Missing");
    expect(() => checkedAssets(paths, selected, "b".repeat(40), {}, undefined)).toThrow("CI artifact");
  });
  fixture({ ...files, [name]: "changed" }, paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("CI artifact"));
  fixture({ ...files, ".env": "synthetic, not a secret" }, paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("Unexpected"));
  fixture({ ...files, [`${name}.stage.json`]: JSON.stringify({ ...receipt, channel: "preview", purpose: "npm-stage",
    stageId: "00000000-0000-0000-0000-000000000001", tag: "latest", status: "awaiting-npm-approval" }) },
    paths => expect(checkedAssets(paths, selected, commit, {}, undefined).size).toBe(3));
  fixture({ ...files, [`${name}.stage.json`]: JSON.stringify({ ...receipt, purpose: "npm-stage", channel: "release" }) },
    paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("stage receipt"));
});

test("Worker attachments check the tagged configuration digest", () => {
  const bytes = Buffer.from("synthetic Worker fixture");
  const config = Buffer.from("synthetic config");
  const worker = { product: "worker", version: "2026.10.0-pre", channel: "preview" };
  const receipt = { ...worker, name: "vrcp-worker", commit, purpose: "ci-release", sha256: digest(bytes), configSha256: digest(config) };
  fixture({ "worker_entry.js": bytes, "worker_entry.js.json": JSON.stringify(receipt) }, paths => {
    expect(checkedAssets(paths, worker, commit, { name: "vrcp-worker" }, config).size).toBe(2);
    expect(() => checkedAssets(paths, worker, commit, { name: "vrcp-worker" }, Buffer.from("changed config"))).toThrow("CI artifact");
  });
});

test("Binary receipts bind both platforms and reject altered, misplaced and unlisted outputs", () => {
  const crawler = { product: "crawler", version: "0.0.0", channel: "release" };
  const files: Record<string, string | Buffer> = {};
  for (const platform of ["linux", "windows"]) {
    const name = platform === "linux" ? "vrcp-crawler-node-linux" : "vrcp-crawler-node.exe";
    const bytes = Buffer.from(`synthetic ${platform}`);
    files[name] = bytes;
    files[`crawler-${platform}.receipt.json`] = JSON.stringify({ ...crawler, commit, purpose: "ci-release",
      files: [{ name, size: bytes.length, sha256: digest(bytes) }] });
  }
  fixture(files, paths => expect(checkedAssets(paths, crawler, commit, {}, undefined).size).toBe(4));
  fixture({ ...files, "vrcp-crawler-node.exe": "changed" }, paths => expect(() => checkedAssets(paths, crawler, commit, {}, undefined)).toThrow("Binary bytes"));
  fixture({ ...files, "crawler-linux.receipt.json": files["crawler-windows.receipt.json"] },
    paths => expect(() => checkedAssets(paths, crawler, commit, {}, undefined)).toThrow("platform"));
  expect(allowedBinary("client.zip", "crawler-client", "0.0.0")).toBe(false);
  expect(allowedBinary("client_0.0.0_x64.msi", "crawler-client", "0.0.0")).toBe(true);
  expect(allowedBinary("client_0.0.0-setup.exe", "crawler-client", "0.0.0")).toBe(true);
  expect(allowedBinary("vrcp-web-0.0.0.tgz", "web", "0.0.0")).toBe(true);
  expect(allowedBinary("vrcp-web-0.0.1.tgz", "web", "0.0.0")).toBe(false);
});

test("Release notes select one bounded product milestone, not every commit or another product", () => {
  const markdown = "# Milestones\n\n## package\n\n- SDK change.\n\n## worker\n\n- Worker-only change.\n";
  const notes = milestoneNotes(markdown, "package", selected, commit, "https://github.com/example/repo/actions/runs/1", "checked");
  expect(notes).toContain("SDK change");
  expect(notes).not.toContain("Worker-only");
  expect(notes).toContain(selected.version);
  expect(() => milestoneNotes(markdown, "crawler", selected, commit, "url", "checked")).toThrow("Missing");
  expect(() => milestoneNotes("## package\n" + "x".repeat(6001), "package", selected, commit, "url", "checked")).toThrow("bounded");
});

test("A release attachment source must be the same repository, tag, workflow and passed capability jobs", () => {
  const run = { event: "push", head_branch: "cloudflare-worker/v2026.10.0-pre", head_sha: commit,
    head_repository: { full_name: "owner/repo" }, path: ".github/workflows/cloudflare-worker.yml" };
  const jobs = ["build", "deploy"].map(name => ({ name, status: "completed", conclusion: "success" }));
  expect(() => checkSourceRun(run, jobs, run.head_branch, "owner/repo", "worker")).not.toThrow();
  const historical = { ...run, head_branch: "worker/v2026.10.0-pre", path: ".github/workflows/worker.yml" };
  expect(() => checkSourceRun(historical, jobs, historical.head_branch, "owner/repo", "worker")).not.toThrow();
  expect(() => checkSourceRun({ ...run, path: historical.path }, jobs, run.head_branch, "owner/repo", "worker")).toThrow("source");
  for (const altered of [{ ...run, event: "pull_request" }, { ...run, head_sha: "main" },
    { ...run, head_repository: { full_name: "attacker/fork" } }, { ...run, path: ".github/workflows/web.yml" }]) {
    expect(() => checkSourceRun(altered, jobs, run.head_branch, "owner/repo", "worker")).toThrow("source");
  }
  expect(() => checkSourceRun(run, jobs.slice(0, 1), run.head_branch, "owner/repo", "worker")).toThrow("source");
  expect(() => checkSourceRun(run, [{ name: "build", status: "completed", conclusion: "failure" }], run.head_branch, "owner/repo", "worker")).toThrow("source");
});

test("Release upload retries retain exact bytes, never clobber assets and publish only after every upload passes", async () => {
  const files = new Map([["CHANGELOG.md", Buffer.from("synthetic notes")], ["CHECKSUMS.sha256", Buffer.from("synthetic checksums")]]);
  let release: any = null;
  const assets: any[] = [];
  const actions: string[] = [];
  let loseACK = true;
  const api = async (method: string, path: string, body: any) => {
    actions.push(method);
    if (method === "GET") {
      if (path.includes("/tags/")) return release?.draft ? null : release;
      return path.includes("/assets?") ? assets : release ? [release] : [];
    }
    if (method === "POST") { release = { ...body, id: 1, assets: [] }; return release; }
    if (method === "UPLOAD") {
      const name = new URL("https://example.test" + path).searchParams.get("name");
      const asset = { name, digest: "sha256:" + digest(body), size: body.length, state: "uploaded" };
      assets.push(asset);
      if (loseACK) { loseACK = false; throw new Error("lost ACK"); }
      return asset;
    }
    Object.assign(release, body);
    return release;
  };
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false)).rejects.toThrow("lost ACK");
  expect(release.draft).toBe(true);
  expect(actions).not.toContain("PATCH");
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false);
  expect(release.draft).toBe(true);
  expect(assets).toHaveLength(2);
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "publication checked", files, false, false);
  expect(release.draft).toBe(false);
  const before = actions.length;
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "publication checked", files, false, false);
  expect(actions.slice(before)).toEqual(["GET", "GET"]);
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false)).rejects.toThrow("regressed");
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "notes", new Map([["CHANGELOG.md", Buffer.from("changed")],
    ["CHECKSUMS.sha256", files.get("CHECKSUMS.sha256")!]]), false, false)).rejects.toThrow("not be overwritten");
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "notes", files, false, true)).rejects.toThrow("channel");
});

test("Every product wires checked release assets while website activation remains disabled", () => {
  const prefixes: Record<string, string> = { "cloudflare-worker": "cloudflare-worker", "vrc-packages-api": "vrcp-api",
    network: "vrcp-network", "node-docker": "vrcp-crawler", "node-client": "vrcp-crawler-client", web: "web" };
  for (const name of ["cloudflare-worker", "vrc-packages-api", "network", "node-docker", "node-client", "web"]) {
    const workflow: any = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
    const job = workflow.jobs["release-assets"];
    expect(workflow.on.push.tags).toEqual([`${prefixes[name]}/v*`]);
    expect(job.uses).toBe("./.github/workflows/release-assets.yml");
    expect(job.permissions.contents).toBe("write");
    expect(job.permissions.actions).toBe("read");
    expect(job.needs).toBeDefined();
    if (name === "web") { expect(workflow.jobs.build.if).toBe(false); expect(job.if).toContain("success"); }
  }
  const reusable: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  expect(reusable.on.workflow_dispatch.inputs.tag.required).toBe(true);
  expect(reusable.jobs.attach.steps.find((step: any) => step.uses?.startsWith("actions/download-artifact@")).with.path).toContain("runner.temp");
});

test("SDK draft reconciliation dispatches only public versions with original checked run links", async () => {
  const draft = { draft: true, tag_name: "vrcp-api/v0.0.0", body: "[Checked CI run](https://github.com/owner/repo/actions/runs/123)" };
  const releases = [draft, { ...draft, tag_name: "package/v2026.10.0-pre" },
    { ...draft, tag_name: "vrcp-api/v0.0.1" }, { ...draft, draft: false },
    { ...draft, tag_name: "cloudflare-worker/v0.0.0" }, { ...draft, tag_name: "vrcp-network/v0.0.0" },
    { ...draft, body: "[Checked CI run](https://github.com/attacker/fork/actions/runs/123)" },
    { ...draft, body: "[Checked CI run](https://github.com/owner/repo/actions/runs/123?modified=true)" },
    { ...draft, tag_name: "vrcp-api/v01.0.0" }, { ...draft, body: "No checked source run" }];
  const dispatched: any[] = [];
  const registry: string[] = [];
  const api = async (method: string, path: string, body: any) => {
    if (method === "GET") return releases;
    expect(path).toBe("/repos/owner/repo/actions/workflows/release-assets.yml/dispatches");
    dispatched.push(body);
    return null;
  };
  expect(await reconcileSDKDrafts(api, "owner/repo", async (name: string, version: string) => {
    registry.push(`${name}@${version}`);
    return version !== "0.0.1";
  })).toBe(2);
  expect(registry).toEqual(["vrc-packages-api@0.0.0", "vrc-packages-api-preview@2026.10.0-pre", "vrc-packages-api@0.0.1"]);
  expect(dispatched.map(item => item.inputs.tag)).toEqual(["vrcp-api/v0.0.0", "package/v2026.10.0-pre"]);
  expect(dispatched.every(item => item.ref === "main" && item.inputs["source-run"] === "123")).toBe(true);
  await expect(reconcileSDKDrafts(api, "owner/repo", async () => { throw new Error("registry unavailable"); })).rejects.toThrow("unavailable");
  await expect(reconcileSDKDrafts(async () => Array(100).fill({ draft: false }), "owner/repo", async () => true)).rejects.toThrow("bound");
  await expect(reconcileSDKDrafts(async (method: string) => method === "GET" ? Array(21).fill(draft) : null,
    "owner/repo", async () => true)).rejects.toThrow("dispatch limit");
  await expect(reconcileSDKDrafts(async () => ({}), "owner/repo", async () => true)).rejects.toThrow("listing");
  const workflow: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/sdk-release-reconcile.yml", import.meta.url), "utf8"));
  expect(workflow.on.schedule).toHaveLength(1);
  expect(workflow.permissions).toEqual({ contents: "read", actions: "write" });
  expect(workflow.jobs["check-drafts"].steps.at(-1).env).toEqual({ RELEASE_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
});
