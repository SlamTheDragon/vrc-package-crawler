import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { checkReleaseSource, requireCI } from "../scripts/delivery.mjs";
import { productDirectories } from "../scripts/versioning.mjs";

function fixture(baseline = false) {
  const workspace = mkdtempSync(join(realpathSync(tmpdir()), "vrcp-release-ingress-"));
  const base = "a".repeat(40), head = "b".repeat(40), commit = "c".repeat(40), tagObject = "d".repeat(40);
  const repository = "example/vrc-packages", prefix = `/repos/${repository}`, pull = `${prefix}/pulls/7`;
  const selected = { product: "worker", channel: "release", version: "0.0.2" };
  const tag = "cloudflare-worker/v0.0.2", actor = { login: "example", type: "User" };
  const prior = Object.fromEntries(Object.keys(productDirectories).filter(name => name !== "network")
    .map(name => [`release-${name}`, "0.0.1"]));
  const current = { ...prior, "release-worker": "0.0.2" };
  const preview = Object.fromEntries(Object.keys(productDirectories).map(name =>
    [`preview-${name}`, name === "network" ? "2026.10.1" : name === "crawler-client" ? "26.10.1-pre" : "2026.10.1-pre"]));
  const json = (value: object) => JSON.stringify(value, null, 2) + "\n";
  const before: Record<string, string> = { "config.versions.json": json(prior), "config.preview.versions.json": json(preview),
    "src-worker/package.json": json({ name: "vrcp-worker", version: "0.0.1" }) };
  const after = { ...before, "config.versions.json": json(current),
    "src-worker/package.json": json({ name: "vrcp-worker", version: "0.0.2" }) };
  writeFileSync(join(workspace, "config.versions.json"), after["config.versions.json"]);
  writeFileSync(join(workspace, "config.preview.versions.json"), after["config.preview.versions.json"]);
  const baselineValue = { schemaVersion: 1, repository, tags: { [tag]: { tagObject, commit } } };
  const saveBaseline = () => {
    mkdirSync(join(workspace, ".github"), { recursive: true });
    writeFileSync(join(workspace, ".github/release-baseline.json"), json(baselineValue));
  };
  if (baseline) saveBaseline();
  const run = { id: 123, event: "push", head_branch: tag, head_sha: commit,
    head_repository: { full_name: repository }, path: ".github/workflows/cloudflare-worker.yml", actor: { ...actor } };
  const source = { repository, commit, tag, tagObject, actor, context: run };
  const annotation = `Finalize worker 0.0.2\n\nVRCP-Release-PR: 7\nVRCP-Release-Head: ${head}\nVRCP-Release-Base: ${base}\n`;
  const local = { tagObject, tagType: "tag", peeled: commit, annotation,
    diff: "config.versions.json\nsrc-worker/package.json\n", mergedTree: "e".repeat(40) };
  const git = (_cwd: string, ...args: string[]) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") return args[2].endsWith("^{commit}") ? local.peeled : local.tagObject;
    if (args[0] === "cat-file") return args[1] === "-t" ? local.tagType :
      `object ${commit}\ntype commit\ntag ${tag}\ntagger example <synthetic@example.invalid> 0 +0000\n\n${local.annotation}`;
    if (args[0] === "ls-tree") {
      const path = args[3];
      return Object.hasOwn(args[1] === base ? before : after, path) ? `100644 blob ${base}\t${path}\n` : "";
    }
    if (args[0] === "show") {
      const [revision, path] = args[1].split(":");
      if (Object.hasOwn(revision === base ? before : after, path)) return (revision === base ? before : after)[path];
      // Per-version changelog files do not exist at the base revision; return empty string to let checkReleaseMetadata skip them cleanly.
      if (path.startsWith("docs/changelogs/")) return "";
      return undefined as any;
    }
    if (args[0] === "diff") return local.diff;
    if (args[0] === "rev-parse" && args[1].endsWith("^{tree}")) return args[1].startsWith(commit) ? local.mergedTree : "e".repeat(40);
    throw new Error(`Unexpected Git read: ${args.join(" ")}`);
  };

  const responses: Record<string, any> = {
    [`${prefix}/actions/runs/123`]: run,
    [`${prefix}/git/ref/tags/${encodeURIComponent(tag)}`]: { ref: `refs/tags/${tag}`, object: { type: "tag", sha: tagObject } },
    [`${prefix}/git/tags/${tagObject}`]: { sha: tagObject, tag, message: annotation, object: { type: "commit", sha: commit } },
    [pull]: { number: 7, state: "closed", merged: true, draft: false, commits: 1,
      base: { ref: "main", repo: { full_name: repository } },
      head: { sha: head, ref: "release/candidate/worker/v0.0.2", repo: { full_name: repository } },
      merge_commit_sha: commit, merged_by: actor, user: actor, merged_at: "2026-10-06T12:00:00Z", auto_merge: null },
    [`${pull}/commits?per_page=2`]: [{ sha: head, parents: [{ sha: base }] }],
    [`${prefix}/commits/${head}`]: { sha: head, parents: [{ sha: base }],
      commit: { message: `Prepare worker\n\nVRCP-Release-Product: worker\nVRCP-Release-Version: 0.0.2\nVRCP-Release-Base: ${base}` },
      files: [{ filename: "config.versions.json", status: "modified" }, { filename: "src-worker/package.json", status: "modified" }] },
    [`${prefix}/commits/${commit}`]: { sha: commit, parents: [{ sha: base }, { sha: head }] },
    [`${prefix}/compare/${commit}...main`]: { status: "ahead", base_commit: { sha: commit }, merge_base_commit: { sha: commit } },
    [`${pull}/reviews?per_page=100`]: [],
  };
  for (const revision of [base, head, commit]) {
    for (const path of ["config.versions.json", "config.preview.versions.json"]) {
      responses[`${prefix}/contents/${path}?ref=${revision}`] = { type: "file", path, encoding: "base64",
        content: Buffer.from((revision === base ? before : after)[path]).toString("base64") };
    }
  }
  const calls: string[] = [];
  const api = async (path: string) => {
    calls.push(path);
    if (!Object.hasOwn(responses, path)) throw new Error(`Unexpected API read: ${path}`);
    return structuredClone(responses[path]);
  };
  const env = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: `refs/tags/${tag}`,
    GITHUB_SHA: commit, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: "123", GITHUB_ACTOR: "ignored-caller" };
  const check = (value = source) => checkReleaseSource(selected, value, api, git, workspace);
  const cleanup = () => {
    const path = realpathSync(workspace);
    if (!path.startsWith(realpathSync(tmpdir()) + sep) || !path.includes("vrcp-release-ingress-")) throw new Error("Unsafe fixture cleanup");
    rmSync(path, { recursive: true });
  };
  return { workspace, base, head, commit, tagObject, tag, selected, source, local, responses, calls, api, git, run,
    env, check, cleanup, prefix, pull, baselineValue, saveBaseline, after };
}

async function withFixture(action: (f: ReturnType<typeof fixture>) => Promise<void>, baseline = false) {
  const f = fixture(baseline);
  try { await action(f); } finally { f.cleanup(); }
}

test("release ingress binds annotation, owner merged PR and reproduced metadata", async () => {
  await withFixture(async f => {
    const proof = await f.check();
    expect(proof.baseline).toBe(false);
    expect(proof.tagObject).toBe(f.tagObject);
    expect(proof.metadata.changed).toEqual(["config.versions.json", "src-worker/package.json"]);
    expect(proof.head).toBe(f.head);
    expect(proof.base).toBe(f.base);
    expect(f.calls.every(path => path.startsWith(f.prefix))).toBe(true);
  });
});

test("release baseline exempts only one exact repo/tag/object/commit tuple from PR proof", async () => {
  await withFixture(async f => {
    f.local.annotation = "Historical annotation without PR trailers";
    expect(await f.check()).toEqual({ repository: f.source.repository, commit: f.commit, tag: f.tag,
      tagObject: f.tagObject, baseline: true });
    expect(f.calls).toHaveLength(2);
    for (const mutate of [() => { f.baselineValue.repository = "foreign/repo"; },
      () => { f.baselineValue.tags[f.tag].tagObject = "f".repeat(40); },
      () => { f.baselineValue.tags[f.tag].commit = "f".repeat(40); }]) {
      f.baselineValue.repository = f.source.repository;
      f.baselineValue.tags[f.tag] = { tagObject: f.tagObject, commit: f.commit };
      mutate(); f.saveBaseline();
      await expect(f.check()).rejects.toThrow("trailer");
    }
  }, true);
});

test("baseline never accepts an App actor or changed immutable local/remote identity", async () => {
  await withFixture(async f => {
    await expect(f.check({ ...f.source, actor: { login: "preview-app", type: "Bot" } })).rejects.toThrow("non-human");
    expect(f.calls).toEqual([]);
    for (const mutate of [() => { f.local.tagType = "commit"; }, () => { f.local.peeled = "f".repeat(40); },
      () => { f.local.tagObject = "f".repeat(40); }]) {
      const saved = { ...f.local }; mutate();
      await expect(f.check()).rejects.toThrow("exact local annotated"); Object.assign(f.local, saved);
    }
    f.responses[`${f.prefix}/git/ref/tags/${encodeURIComponent(f.tag)}`].object.type = "commit";
    await expect(f.check()).rejects.toThrow("annotated remote");
    f.responses[`${f.prefix}/git/ref/tags/${encodeURIComponent(f.tag)}`].object = { type: "tag", sha: "f".repeat(40) };
    await expect(f.check()).rejects.toThrow("tag object differs");
  }, true);
});

test("forged tags at historical commits cannot reuse a baseline source SHA", async () => {
  await withFixture(async f => {
    f.baselineValue.tags[f.tag].tagObject = "f".repeat(40); f.saveBaseline();
    f.local.annotation = "Forged tag without proof";
    await expect(f.check()).rejects.toThrow("trailer");
  }, true);
});

test("tag PR/head/base locators do not grant release authorization", async () => {
  for (const mutate of [
    (f: any) => { f.local.annotation += "VRCP-Release-PR: 7\n"; },
    (f: any) => { f.local.annotation = f.local.annotation.replace("PR: 7", "PR: 07"); },
    (f: any) => { f.local.annotation = f.local.annotation.replace("PR: 7", "PR:7"); },
    (f: any) => { f.local.annotation = f.local.annotation.replace(f.head, "f".repeat(40)); },
    (f: any) => { f.local.annotation = f.local.annotation.replace(f.base, "f".repeat(40)); },
    (f: any) => { f.responses[f.pull].merged = false; },
    (f: any) => { f.responses[f.pull].merge_commit_sha = "f".repeat(40); },
    (f: any) => { f.responses[f.pull].head.repo.full_name = "foreign/repo"; },
    (f: any) => { f.responses[f.pull].head.sha = "f".repeat(40); },
    (f: any) => { f.responses[f.pull].merged_by = { type: "Bot", login: "preview-app" }; },
    (f: any) => { f.responses[`${f.prefix}/compare/${f.commit}...main`].status = "diverged"; },
    (f: any) => { f.responses[`${f.pull}/reviews?per_page=100`] = [{ id: 1, user: { login: "reviewer", type: "User" },
      state: "CHANGES_REQUESTED", submitted_at: "2026-10-06T11:00:00Z" }]; },
    (f: any) => { f.local.diff += "scripts/delivery.mjs\n"; },
    (f: any) => { f.local.mergedTree = "f".repeat(40); },
    (f: any) => { f.after["src-worker/package.json"] = JSON.stringify({ name: "changed", version: "0.0.2" }); },
  ]) await withFixture(async f => { mutate(f); await expect(f.check()).rejects.toThrow(); });
});

test("CI uses original run actor, not caller login or rerun triggering actor", async () => {
  await withFixture(async f => {
    expect((await requireCI("worker", "release", f.env, f.workspace, f.api, f.git)).product).toBe("worker");
    f.responses[`${f.prefix}/actions/runs/123`].triggering_actor = { login: "preview-app", type: "Bot" };
    expect((await requireCI("worker", "release", f.env, f.workspace, f.api, f.git)).product).toBe("worker");
    f.responses[`${f.prefix}/actions/runs/123`].actor = { login: "preview-app", type: "Bot" };
    await expect(requireCI("worker", "release", f.env, f.workspace, f.api, f.git)).rejects.toThrow("non-human");
  }, true);
});

test("CI rejects foreign run, dispatch, wrong workflow/tag/SHA and missing run identity", async () => {
  for (const change of [{ id: 456 }, { event: "workflow_dispatch" }, { head_branch: "main" },
    { head_sha: "f".repeat(40) }, { path: ".github/workflows/node-docker.yml" },
    { head_repository: { full_name: "foreign/repo" } }, { actor: null }]) {
    await withFixture(async f => {
      Object.assign(f.responses[`${f.prefix}/actions/runs/123`], change);
      await expect(requireCI("worker", "release", f.env, f.workspace, f.api, f.git)).rejects.toThrow();
    }, true);
  }
  await withFixture(async f => {
    for (const change of [{ GITHUB_RUN_ID: "" }, { GITHUB_RUN_ID: "1.5" }, { GITHUB_REPOSITORY: "" }]) {
      await expect(requireCI("worker", "release", { ...f.env, ...change }, f.workspace, f.api, f.git)).rejects.toThrow("original Actions run identity");
    }
    expect(f.calls).toEqual([]);
    const env = { ...f.env, GITHUB_REF: "refs/tags/cloudflare-worker/v2026.10.1-pre", GITHUB_RUN_ID: "" };
    expect((await requireCI("worker", "preview", env, f.workspace, f.api, f.git)).channel).toBe("preview");
    expect(f.calls).toEqual([]);
  });
});
