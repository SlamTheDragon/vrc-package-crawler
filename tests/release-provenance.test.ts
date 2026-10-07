import { expect, test } from "bun:test";
import { checkReviewedRelease, readGitHubAPI } from "../scripts/delivery.mjs";
import { productDirectories } from "../scripts/versioning.mjs";

function fixture() {
  const base = "a".repeat(40), head = "b".repeat(40), commit = "c".repeat(40);
  const repository = "example/vrc-packages", prefix = `/repos/${repository}`, pull = `${prefix}/pulls/7`;
  const selected = { product: "worker", channel: "release", version: "0.0.2" };
  const proof = { repository, commit, tag: "cloudflare-worker/v0.0.2", prNumber: 7, head, base };
  const user = { login: "maintainer", type: "User" };
  const prior = Object.fromEntries(Object.keys(productDirectories).filter(name => name !== "network")
    .map(name => [`release-${name}`, "0.0.1"]));
  const current = { ...prior, "release-worker": "0.0.2" };
  const preview = Object.fromEntries(Object.keys(productDirectories).map(name =>
    [`preview-${name}`, name === "network" ? "2026.10.1" : name === "crawler-client" ? "26.10.1-pre" : "2026.10.1-pre"]));
  const responses: Record<string, any> = {
    [pull]: { number: 7, state: "closed", merged: true, draft: false, commits: 1,
      base: { ref: "main", repo: { full_name: repository } },
      head: { sha: head, ref: "release/candidate/worker/v0.0.2", repo: { full_name: repository } },
      merge_commit_sha: commit, merged_by: { login: "example", type: "User" }, user: { login: "author", type: "User" },
      merged_at: "2026-10-06T12:00:00Z", auto_merge: null },
    [`${pull}/commits?per_page=2`]: [{ sha: head, parents: [{ sha: base }] }],
    [`${prefix}/commits/${head}`]: { sha: head, parents: [{ sha: base }],
      commit: { message: `Prepare worker release 0.0.2\n\nVRCP-Release-Product: worker\nVRCP-Release-Version: 0.0.2\nVRCP-Release-Base: ${base}` },
      files: [{ filename: "config.versions.json", status: "modified" }, { filename: "src-worker/package.json", status: "modified" }] },
    [`${prefix}/commits/${commit}`]: { sha: commit, parents: [{ sha: base }, { sha: head }] },
    [`${prefix}/compare/${commit}...main`]: { status: "ahead", base_commit: { sha: commit }, merge_base_commit: { sha: commit } },
    [`${pull}/reviews?per_page=100`]: [{ id: 1, state: "APPROVED", user: { ...user },
      commit_id: head, submitted_at: "2026-10-06T11:00:00Z" }],
  };
  const file = (path: string, config: object) => ({ type: "file", path, encoding: "base64",
    content: Buffer.from(JSON.stringify(config)).toString("base64") });
  for (const revision of [base, head, commit]) {
    responses[`${prefix}/contents/config.versions.json?ref=${revision}`] = file("config.versions.json", revision === base ? prior : current);
    responses[`${prefix}/contents/config.preview.versions.json?ref=${revision}`] = file("config.preview.versions.json", preview);
  }
  const calls: string[] = [];
  const api = async (path: string) => {
    calls.push(path);
    if (!Object.hasOwn(responses, path)) throw new Error(`Unexpected proof read: ${path}`);
    return structuredClone(responses[path]);
  };
  return { base, head, commit, selected, proof, prefix, pull, responses, calls, api, file, prior, current, preview };
}

test("reviewed release binds the version PR to its merged main commit without remote writes", async () => {
  const f = fixture();
  expect(await checkReviewedRelease(f.selected, f.proof, f.api)).toEqual({ ...f.proof,
    previous: "0.0.1", version: "0.0.2", preparedFiles: ["config.versions.json", "src-worker/package.json"] });
  expect(f.calls.every(path => path.startsWith(f.prefix))).toBe(true);
  for (const author of ["example", "author"]) {
    f.responses[f.pull].user.login = author;
    f.responses[`${f.prefix}/commits/${f.commit}`].parents = [{ sha: f.base }];
    f.responses[`${f.prefix}/compare/${f.commit}...main`].status = "identical";
    expect((await checkReviewedRelease(f.selected, f.proof, f.api)).commit).toBe(f.commit);
  }
  // A one-commit rebase can retain the prepared head itself as the merged commit.
  const rebased = fixture();
  rebased.proof.commit = rebased.head;
  rebased.responses[rebased.pull].merge_commit_sha = rebased.head;
  rebased.responses[`${rebased.prefix}/compare/${rebased.head}...main`] = {
    status: "identical", base_commit: { sha: rebased.head }, merge_base_commit: { sha: rebased.head },
  };
  expect((await checkReviewedRelease(rebased.selected, rebased.proof, rebased.api)).commit).toBe(rebased.head);
});

test("malformed release identities and App actors stop before GitHub reads", async () => {
  for (const change of [{ repository: "https://github.com/example/repo" }, { prNumber: 0 }, { prNumber: 1.5 },
    { head: "bad" }, { base: "b".repeat(40) }, { commit: "C".repeat(40) }, { tag: "worker/v0.0.2" },
    { actor: { login: "vrcp-preview[bot]", type: "Bot" } }, { actor: "maintainer" }]) {
    const f = fixture();
    await expect(checkReviewedRelease(f.selected, { ...f.proof, ...change }, f.api)).rejects.toThrow("Invalid reviewed release");
    expect(f.calls).toEqual([]);
  }
  for (const selected of [{ product: "worker", channel: "preview", version: "0.0.2" },
    { product: "web", channel: "release", version: "0.0.2" },
    { product: "package", channel: "release", version: "0.1.0" }]) {
    const f = fixture();
    const tag = selected.product === "package" ? "vrcp-api/v0.1.0" : selected.product === "web" ? "web/v0.0.2" : f.proof.tag;
    await expect(checkReviewedRelease(selected, { ...f.proof, tag }, f.api)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  }
});

test("owner-approved main advancement accepts only bounded tracker-only commits", async () => {
  const f = fixture(), parent = "d".repeat(40);
  f.responses[`${f.prefix}/commits/${f.commit}`].parents[0].sha = parent;
  const comparison = `${f.prefix}/compare/${f.base}...${parent}`;
  f.responses[comparison] = { status: "ahead", base_commit: { sha: f.base }, merge_base_commit: { sha: f.base },
    total_commits: 1, commits: [{ sha: parent }] };
  f.responses[`${f.prefix}/commits/${parent}`] = { sha: parent,
    files: [{ filename: "docs/scratch/task_tracker.md", status: "modified" }] };
  expect((await checkReviewedRelease(f.selected, f.proof, f.api)).trackerParent).toBe(parent);
  for (const filename of ["config.versions.json", "scripts/delivery.mjs", ".github/workflows/node-docker.yml",
    "src-worker/src/worker_entry.ts", "docs/source/DELIVERY.md"]) {
    f.responses[`${f.prefix}/commits/${parent}`].files[0].filename = filename;
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("approved task tracker");
  }
  f.responses[`${f.prefix}/commits/${parent}`].files[0].filename = "docs/scratch/task_tracker.md";
  for (const status of ["added", "removed", "renamed"]) {
    f.responses[`${f.prefix}/commits/${parent}`].files[0].status = status;
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("approved task tracker");
  }
  f.responses[`${f.prefix}/commits/${parent}`].files[0].status = "modified";
  for (const patch of [{ status: "diverged" }, { total_commits: 21 }, { total_commits: 2 }, { commits: [] },
    { merge_base_commit: { sha: parent } }, { base_commit: { sha: parent } }]) {
    const original = structuredClone(f.responses[comparison]);
    Object.assign(f.responses[comparison], patch);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("tracker-only");
    f.responses[comparison] = original;
  }
  const earlier = "e".repeat(40);
  f.responses[comparison].total_commits = 2;
  f.responses[comparison].commits.unshift({ sha: earlier });
  f.responses[`${f.prefix}/commits/${earlier}`] = { sha: earlier,
    files: [{ filename: "scripts/delivery.mjs", status: "modified" }] };
  // A later tracker-only net diff must not hide an earlier runtime change.
  await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("approved task tracker");
});

test("foreign, unmerged, changed-head and test-merge PR evidence cannot finalize", async () => {
  for (const mutate of [
    (pr: any) => { pr.base.repo.full_name = "foreign/repo"; },
    (pr: any) => { pr.head.repo.full_name = "foreign/repo"; },
    (pr: any) => { pr.base.ref = "feature"; },
    (pr: any) => { pr.state = "open"; },
    (pr: any) => { pr.merged = false; },
    (pr: any) => { pr.draft = true; },
    (pr: any) => { pr.head.sha = "d".repeat(40); },
    (pr: any) => { pr.merge_commit_sha = "d".repeat(40); },
    (pr: any) => { pr.commits = 2; },
    (pr: any) => { pr.merged_by.type = "Bot"; },
    (pr: any) => { pr.merged_by.login = "another-maintainer"; },
    (pr: any) => { pr.user.type = "Bot"; },
    (pr: any) => { pr.auto_merge = {}; },
    (pr: any) => { pr.merged_at = null; },
  ]) {
    const f = fixture(); mutate(f.responses[f.pull]);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("exact merged main");
  }
});

test("preparation branch, trailers, one-commit history and main parent stay exact", async () => {
  for (const mutate of [
    (f: any) => { f.responses[`${f.pull}/commits?per_page=2`].push({ sha: f.base }); },
    (f: any) => { f.responses[`${f.pull}/commits?per_page=2`][0].parents[0].sha = "d".repeat(40); },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.head}`].parents.push({ sha: f.head }); },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.head}`].commit.message += "\nVRCP-Release-Version: 0.0.2"; },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.head}`].commit.message = "Missing preparation trailers"; },
    (f: any) => { f.responses[f.pull].head.ref = "evergreen-tracking"; },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.commit}`].parents[0].sha = "d".repeat(40); },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.commit}`].parents[1].sha = "d".repeat(40); },
  ]) {
    const f = fixture(); mutate(f);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow();
  }
});

test("main reachability and complete version config evidence fail closed", async () => {
  for (const change of [{ status: "behind" }, { status: "diverged" },
    { merge_base_commit: { sha: "d".repeat(40) } }, { base_commit: { sha: "d".repeat(40) } }]) {
    const f = fixture(); Object.assign(f.responses[`${f.prefix}/compare/${f.commit}...main`], change);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("not reachable");
  }
  for (const mutate of [
    (f: any) => { f.current["release-crawler"] = "0.0.2"; },
    (f: any) => { f.current["release-worker"] = "0.0.3"; },
    (f: any) => { delete f.current["release-crawler"]; },
    (f: any) => { f.preview["preview-worker"] = "0.0.2"; },
  ]) {
    const f = fixture(); mutate(f);
    f.responses[`${f.prefix}/contents/config.versions.json?ref=${f.head}`] = f.file("config.versions.json", f.current);
    f.responses[`${f.prefix}/contents/config.preview.versions.json?ref=${f.head}`] = f.file("config.preview.versions.json", f.preview);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow();
  }
  const f = fixture();
  f.responses[`${f.prefix}/contents/config.versions.json?ref=${f.commit}`].content = Buffer.from("[]").toString("base64");
  await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("invalid keys");
});

test("owner-reviewed manual merge needs no second reviewer or extra credential permission", async () => {
  const f = fixture();
  f.responses[f.pull].user.login = "example";
  f.responses[`${f.pull}/reviews?per_page=100`] = [];
  expect((await checkReviewedRelease(f.selected, f.proof, f.api)).commit).toBe(f.commit);
  expect(f.calls.some(path => path.includes("/collaborators/"))).toBe(false);
});

test("comments do not erase requested changes; later substantive reviews can resolve them", async () => {
  const f = fixture(), path = `${f.pull}/reviews?per_page=100`;
  f.responses[path].push({ id: 2, state: "CHANGES_REQUESTED", user: { login: "reviewer", type: "User" },
    commit_id: f.head, submitted_at: "2026-10-06T11:10:00Z" });
  f.responses[path].push({ id: 3, state: "COMMENTED", user: { login: "reviewer", type: "User" },
    commit_id: f.head, submitted_at: "2026-10-06T11:20:00Z" });
  await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("unresolved requested changes");
  f.responses[path].push({ id: 4, state: "DISMISSED", user: { login: "reviewer", type: "User" },
    commit_id: f.head, submitted_at: "2026-10-06T11:30:00Z" });
  expect((await checkReviewedRelease(f.selected, f.proof, f.api)).commit).toBe(f.commit);
  f.responses[path].push({ ...f.responses[path][0], id: 5, state: "CHANGES_REQUESTED", submitted_at: "2026-10-06T11:40:00Z" });
  await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow("unresolved requested changes");
});

test("malformed and truncated review or prepared-file evidence is rejected", async () => {
  for (const mutate of [
    (f: any) => { f.responses[`${f.pull}/reviews?per_page=100`][0].state = "UNKNOWN"; },
    (f: any) => { f.responses[`${f.pull}/reviews?per_page=100`][0].submitted_at = "invalid"; },
    (f: any) => { f.responses[`${f.pull}/reviews?per_page=100`].push(f.responses[`${f.pull}/reviews?per_page=100`][0]); },
    (f: any) => { f.responses[`${f.pull}/reviews?per_page=100`] = Array(100).fill({}); },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.head}`].files = []; },
    (f: any) => { f.responses[`${f.prefix}/commits/${f.head}`].files[0].status = "renamed"; },
  ]) {
    const f = fixture(); mutate(f);
    await expect(checkReviewedRelease(f.selected, f.proof, f.api)).rejects.toThrow();
  }
});

test("GitHub proof reader uses explicit credentials only and keeps failures bounded", async () => {
  const calls: Array<{ url: string; options: any }> = [];
  const request = async (url: string, options: any) => {
    calls.push({ url, options });
    return new Response('{"ok":true}', { status: 200 });
  };
  expect(await readGitHubAPI({}, request)("/repos/example/repo/pulls/7")).toEqual({ ok: true });
  expect(calls[0].options.headers.authorization).toBeUndefined();
  expect(calls[0].options.redirect).toBe("error");
  for (const path of ["https://foreign.test/repos/a/b/", "//foreign.test/repos/a/b/", "/user", "/repos/a/b/../../../user", "/repos/a/b/pulls/7\n"]) {
    await expect(readGitHubAPI({}, request)(path)).rejects.toThrow();
  }
  expect(calls).toHaveLength(1);
  // This value is an inert test marker, not a stored or usable credential.
  await readGitHubAPI({ GH_TOKEN: "test-marker" }, request)("/repos/example/repo/pulls/7");
  expect(calls[1].options.headers.authorization).toBe("Bearer test-marker");
  const denied = async () => new Response("Sensitive provider diagnostic", { status: 403 });
  await expect(readGitHubAPI({}, denied)("/repos/example/repo/pulls/7")).rejects.toThrow("explicit read credential");
  const exhausted = async () => new Response("Sensitive provider diagnostic", { status: 403,
    headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791261187" } });
  await expect(readGitHubAPI({}, exhausted)("/repos/example/repo/pulls/7"))
    .rejects.toThrow("rate-limited (403). Retry after 2026-10-06T04:33:07.000Z. No tag push ran.");
  const throttled = async () => new Response("Sensitive provider diagnostic", { status: 429,
    headers: { "x-ratelimit-reset": "untrusted provider text" } });
  await expect(readGitHubAPI({}, throttled)("/repos/example/repo/pulls/7"))
    .rejects.toThrow("rate-limited (429). No tag push ran.");
  const oversized = async () => new Response("x".repeat(1_048_577));
  await expect(readGitHubAPI({}, oversized)("/repos/example/repo/pulls/7")).rejects.toThrow("exceeds its limit");
  const malformed = async () => new Response("Sensitive provider diagnostic");
  await expect(readGitHubAPI({}, malformed)("/repos/example/repo/pulls/7")).rejects.toThrow("Invalid release proof metadata JSON");
});
