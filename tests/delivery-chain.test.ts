import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { inspectDelivery, planDelivery, repositoryFromRemote, retryDelivery, startDelivery, summarizeRun } from "../scripts/delivery-chain.mjs";
import { productDirectories } from "../scripts/versioning.mjs";
import { createHash } from "node:crypto";

const now = new Date("2026-10-05T00:00:00Z");
async function fixture(run: (workspace: string, git: (workspace: string, ...args: string[]) => string) => Promise<void>) {
  const parent = await realpath(tmpdir()), directory = await mkdtemp(resolve(parent, "vrcp-chain-test-"));
  const workspace = resolve(directory, "source"), remote = resolve(directory, "origin.git");
  const actual = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 15_000 }).trim();
  try {
    await mkdir(workspace);
    actual(directory, "init", "--bare", remote);
    actual(workspace, "init", "-b", "main");
    actual(workspace, "config", "user.name", "VRCP synthetic fixture");
    actual(workspace, "config", "user.email", "fixture@example.invalid");
    for (const channel of ["preview", "release"]) {
      await writeFile(resolve(workspace, channel === "preview" ? "config.preview.versions.json" : "config.versions.json"),
        JSON.stringify(Object.fromEntries(Object.keys(productDirectories).map(product =>
          [`${channel}-${product}`, channel === "release" ? "0.0.0" : product === "crawler-client" ? "26.10.0-pre" : "2026.10.0-pre"]))));
    }
    await mkdir(resolve(workspace, productDirectories.network), { recursive: true });
    await writeFile(resolve(workspace, productDirectories.network, "package.json"), JSON.stringify({ name: "vrc-packages-network", version: "0.0.0" }));
    actual(workspace, "add", "."); actual(workspace, "commit", "-m", "Synthetic delivery fixture");
    actual(workspace, "remote", "add", "origin", remote); actual(workspace, "push", "-u", "origin", "main");
    // Only identity lookup is substituted. Commits, tags, atomic pushes and divergence use real Git in a temporary bare remote.
    const git = (cwd: string, ...args: string[]) => args.join(" ") === "remote get-url origin"
      ? "https://github.com/example/fixture.git" : actual(cwd, ...args);
    await run(workspace, git);
  } finally {
    const child = relative(parent, await realpath(directory));
    if (!child || isAbsolute(child) || child.startsWith(`..${sep}`) || child === "..") throw new Error("Unsafe fixture cleanup");
    await rm(directory, { recursive: true, maxRetries: 5, retryDelay: 100 });
  }
}

test("root chain dry-run is read-only; execute atomically commits one config and tag; retry does not bump", async () => {
  await fixture(async (workspace, git) => {
    const before = git(workspace, "rev-parse", "HEAD");
    const release = await readFile(resolve(workspace, "config.versions.json"), "utf8");
    const plan = await startDelivery("preview", "network", false, workspace, now, git);
    expect(plan.tag).toBe("vrcp-network/v2026.10.1-pre"); expect(plan.blockers).toEqual([]);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(before);
    expect(git(workspace, "status", "--porcelain")).toBe("");
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    expect(result.status).toBe("pushed"); expect(result.commit).not.toBe(before);
    expect(git(workspace, "diff", "--name-only", before, result.commit)).toBe("config.preview.versions.json");
    expect(await readFile(resolve(workspace, "config.versions.json"), "utf8")).toBe(release);
    expect(retryDelivery(result.tag, workspace, git).status).toBe("already-pushed");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(result.commit);
    // Read exact historical config at the tag, not a later local bump.
    const next = JSON.parse(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8"));
    next["preview-network"] = "2026.10.2-pre";
    await writeFile(resolve(workspace, "config.preview.versions.json"), JSON.stringify(next));
    expect(retryDelivery(result.tag, workspace, git).version).toBe("2026.10.1-pre");
  });
}, 60_000);

test("dirty worktrees, divergent origin, existing tags and SDK holds fail without config writes", async () => {
  await fixture(async (workspace, git) => {
    const path = resolve(workspace, "config.preview.versions.json"), before = await readFile(path, "utf8");
    await writeFile(resolve(workspace, "owner.txt"), "Owner edits must not be committed");
    expect((await planDelivery("preview", "crawler-client", workspace, now, git)).version).toBe("26.10.1-pre");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("dirty");
    expect(await readFile(path, "utf8")).toBe(before);
    git(workspace, "add", "owner.txt"); git(workspace, "commit", "-m", "Owner change not yet pushed");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("differs");
    git(workspace, "push", "origin", "main");
    git(workspace, "tag", "vrcp-network/v2026.10.1-pre");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("already exists");
    expect((await planDelivery("release", "worker", workspace, now, git)).delivery).toBe("ci-build-only-no-production-deployment");
    await expect(planDelivery("preview", "web", workspace, now, git)).rejects.toThrow("deferred");
    const release = JSON.parse(await readFile(resolve(workspace, "config.versions.json"), "utf8"));
    release["release-package"] = "0.0.999";
    await writeFile(resolve(workspace, "config.versions.json"), JSON.stringify(release));
    expect((await planDelivery("release", "package", workspace, now, git)).version).toBe("0.0.1000");
    release["release-package"] = "0.1.0";
    await writeFile(resolve(workspace, "config.versions.json"), JSON.stringify(release));
    await expect(planDelivery("release", "package", workspace, now, git)).rejects.toThrow("owner API review");
    expect(await readFile(path, "utf8")).toBe(before);
  });
}, 60_000);

test("lost push acknowledgments recover the same tag, but differing remote tags never move", async () => {
  await fixture(async (workspace, git) => {
    let lost = true;
    const flaky = (cwd: string, ...args: string[]) => {
      const result = git(cwd, ...args);
      if (args[0] === "push" && lost) { lost = false; throw new Error("Synthetic lost push acknowledgment"); }
      return result;
    };
    await expect(startDelivery("preview", "network", true, workspace, now, flaky)).rejects.toThrow("lost push");
    const tag = "vrcp-network/v2026.10.1-pre";
    expect(retryDelivery(tag, workspace, git).status).toBe("already-pushed");
    const conflict = (cwd: string, ...args: string[]) => args[0] === "ls-remote"
      ? `${"a".repeat(40)}\trefs/tags/${tag}` : git(cwd, ...args);
    expect(() => retryDelivery(tag, workspace, conflict)).toThrow("Replacement needs separate owner authorization");
  });
}, 60_000);

test("CI summaries keep staging, failed builds, absent publication and Worker assets distinct", () => {
  const success = { status: "completed", conclusion: "success" };
  expect(summarizeRun({ status: "waiting" }, [], null, "crawler")).toBe("ci-active-or-awaiting-environment");
  expect(summarizeRun({ ...success, conclusion: "failure" }, [], {}, "package")).toBe("ci-failed");
  expect(summarizeRun(success, [], { draft: true }, "package")).toBe("awaiting-npm-owner-approval");
  expect(summarizeRun(success, [], null, "crawler")).toBe("publication-not-proved");
  expect(summarizeRun(success, [], { draft: false }, "network")).toBe("released-artifacts-unverified");
  expect(summarizeRun(success, [{ name: "deploy", conclusion: "success" }], null, "worker")).toBe("preview-deployed-no-release-assets");
  expect(summarizeRun(success, [{ name: "deploy", conclusion: "skipped" }], null, "worker")).toBe("deployment-not-proved");
  expect(summarizeRun(success, [{ name: "build", conclusion: "success" }, { name: "deploy", conclusion: "skipped" }], null, "worker", "release"))
    .toBe("release-build-only-no-production-deployment");
  expect(summarizeRun(success, [{ name: "build", conclusion: "success" }, { name: "deploy", conclusion: "success" }], null, "worker", "release"))
    .toBe("build-only-boundary-not-proved");
  expect(repositoryFromRemote("git@github.com:example/fixture.git")).toBe("example/fixture");
  for (const url of ["https://token@github.com/example/fixture", "https://evil.invalid/example/fixture", "../escape"]) {
    expect(() => repositoryFromRemote(url)).toThrow();
  }
});

test("memory-only release checks use exact source receipts and reject bad channels, bytes and checksum coverage", async () => {
  await fixture(async (workspace, git) => {
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    git(workspace, "remote", "set-url", "origin", "https://github.com/example/fixture.git");
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const tar = "vrc-packages-network-2026.10.1-pre.tgz";
    const files = new Map<string, Buffer>([[tar, Buffer.from("Synthetic test bytes, not a release artifact")]]);
    files.set(`${tar}.json`, Buffer.from(JSON.stringify({ name: "vrc-packages-network", version: result.version,
      commit: result.commit, purpose: "ci-release", sha256: hash(files.get(tar)!) })));
    const url = "https://github.com/example/fixture/actions/runs/123";
    files.set("CHANGELOG.md", Buffer.from(`Commit: ${result.commit}.\n[Checked CI run](${url})\n`));
    const checksums = () => Buffer.from([...files].filter(([name]) => name !== "CHECKSUMS.sha256")
      .map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n");
    files.set("CHECKSUMS.sha256", checksums());
    const run = { id: 123, head_sha: result.commit, head_branch: result.tag, event: "push", html_url: url,
      status: "completed", conclusion: "success", path: ".github/workflows/network.yml", head_repository: { full_name: "example/fixture" } };
    const release = { id: 123, draft: false, prerelease: true };
    let remoteCommit = result.commit, remoteTagObject = result.tagObject;
    const api = async (path: string) => {
      if (path.includes("/git/ref/tags/")) return { ref: `refs/tags/${result.tag}`, object: { type: "tag", sha: remoteTagObject } };
      if (path.includes("/git/tags/")) return { sha: remoteTagObject, object: { type: "commit", sha: remoteCommit } };
      if (path.includes("/runs?")) return { workflow_runs: [run] };
      if (path.includes("/jobs?")) return { total_count: 1, jobs: [{ name: "build", status: "completed", conclusion: "success" }] };
      if (path.includes("/assets?")) return [...files].map(([name, bytes]) => ({ name, size: bytes.length,
        digest: `sha256:${hash(bytes)}`, browser_download_url: `https://github.com/example/fixture/releases/download/trial/${name}` }));
      return release;
    };
    const previousFetch = globalThis.fetch;
    let corrupt = false, moveDuringRead = false;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const name = new URL(String(input)).pathname.split("/").pop()!;
      if (moveDuringRead) remoteCommit = "b".repeat(40);
      return new Response(corrupt ? Buffer.from("Corrupted synthetic transport") : files.get(name));
    }) as typeof fetch;
    try {
      expect((await inspectDelivery(result.tag, false, workspace, api)).artifactsVerified).toBe(false);
      expect((await inspectDelivery(result.tag, true, workspace, api)).artifactsVerified).toBe(true);
      remoteCommit = "b".repeat(40);
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("source commit");
      remoteCommit = result.commit; remoteTagObject = "c".repeat(40);
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("tag object differs");
      remoteTagObject = result.tagObject;
      moveDuringRead = true;
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("source commit");
      moveDuringRead = false; remoteCommit = result.commit;
      release.prerelease = false;
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("channel differs");
      release.prerelease = true; corrupt = true;
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow();
      corrupt = false;
      files.set("CHECKSUMS.sha256", Buffer.from("incomplete"));
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("incomplete");
      files.set(`${tar}.json`, Buffer.from(JSON.stringify({ name: "vrc-packages-network", version: result.version,
        commit: "a".repeat(40), purpose: "ci-release", sha256: hash(files.get(tar)!) })));
      files.set("CHECKSUMS.sha256", checksums());
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("CI artifact differs");
      run.status = "in_progress";
      expect((await inspectDelivery(result.tag, true, workspace, api)).artifactsVerified).toBe(false);
      expect(git(workspace, "status", "--porcelain")).toBe("");
    } finally { globalThis.fetch = previousFetch; }
  });
}, 60_000);
