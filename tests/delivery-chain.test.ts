import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { inspectDelivery, planDelivery, readHostedAsset, readNetworkDistribution, repositoryFromRemote, retryDelivery, startDelivery, summarizeRun } from "../scripts/delivery-chain.mjs";
import { networkArchiveURL, productDirectories } from "../scripts/versioning.mjs";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const now = new Date("2026-10-05T00:00:00Z");

test("Worker root checks archive bytes and exact config without querying or creating a Release", async () => {
  await fixture(async (workspace, git) => {
    for (const channel of ["preview", "release"]) {
      const result = await startDelivery(channel, "worker", true, workspace, now, git);
      const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
      const config = execFileSync("git", ["show", `${result.commit}:src-worker/wrangler.toml`], { cwd: workspace });
      const bundle = Buffer.from("Synthetic Worker bundle");
      const receipt = { product: "worker", name: "vrcp-worker", version: result.version, channel,
        commit: result.commit, configSha256: hash(config), purpose: "ci-release", sha256: hash(bundle) };
      let bytes = zipSync({ "worker_entry.js": bundle, "worker_entry.js.json": Buffer.from(JSON.stringify(receipt)) });
      const run = { id: 123, head_sha: result.commit, head_branch: result.tag, event: "push", status: "completed",
        conclusion: "success", path: ".github/workflows/cloudflare-worker.yml" };
      let remoteObject = result.tagObject, moveDuringRead = false, downloads = 0, buildConclusion = "success";
      const api = async (path: string, _missing = false, format = "json") => {
        if (path.includes("/releases/")) throw new Error("Worker must not query Release assets");
        if (format === "archive") { downloads++; if (moveDuringRead) remoteObject = "c".repeat(40); return bytes; }
        if (path.includes("/git/ref/tags/")) return { ref: `refs/tags/${result.tag}`, object: { type: "tag", sha: remoteObject } };
        if (path.includes("/git/tags/")) return { sha: remoteObject, object: { type: "commit", sha: result.commit } };
        if (path.includes("/runs?")) return { workflow_runs: [run] };
        if (path.includes("/jobs?")) return { total_count: 2, jobs: [{ name: "build", conclusion: buildConclusion },
          { name: "deploy", conclusion: channel === "preview" ? "success" : "skipped" }] };
        if (path.includes("/artifacts?")) return { total_count: 1, artifacts: [{ id: 7, name: `worker-${channel}-bundle`,
          size_in_bytes: bytes.length, digest: `sha256:${hash(bytes)}`, expired: false, workflow_run: { head_sha: result.commit } }] };
        throw new Error("Unexpected metadata request");
      };
      git(workspace, "remote", "set-url", "origin", "https://github.com/example/fixture.git");
      expect((await inspectDelivery(result.tag, false, workspace, api)).artifactsVerified).toBe(false);
      expect(downloads).toBe(0);
      const proof = await inspectDelivery(result.tag, true, workspace, api);
      expect(proof.ciBundleVerified).toBe(true);
      expect(proof.artifactsVerified).toBe(true);
      expect(proof.bundleSha256).toBe(hash(bundle));
      expect(proof.status).toBe(channel === "preview" ? "preview-deployed-no-release-assets" : "release-build-only-no-production-deployment");
      run.status = "in_progress";
      expect((await inspectDelivery(result.tag, true, workspace, api)).artifactsVerified).toBe(false);
      run.status = "completed"; run.conclusion = "failure";
      expect((await inspectDelivery(result.tag, true, workspace, api)).artifactsVerified).toBe(false);
      run.conclusion = "success"; moveDuringRead = true;
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("tag object differs");
      moveDuringRead = false; remoteObject = result.tagObject;
      bytes = zipSync({ "worker_entry.js": bundle, "worker_entry.js.json": Buffer.from(JSON.stringify({ ...receipt, configSha256: "d".repeat(64) })) });
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("CI artifact differs");
      buildConclusion = "failure";
      if (channel === "preview") await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("build success");
      else expect((await inspectDelivery(result.tag, true, workspace, api)).artifactsVerified).toBe(false);
      git(workspace, "remote", "set-url", "origin", resolve(workspace, "../origin.git"));
      expect(git(workspace, "status", "--porcelain")).toBe("");
    }
  });
}, 60_000);

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
        JSON.stringify(Object.fromEntries(Object.keys(productDirectories).filter(product => channel !== "release" || product !== "network").map(product =>
          [`${channel}-${product}`, channel === "release" ? "0.0.0" : product === "crawler-client" ? "26.10.0-pre" : product === "network" ? "2026.10.0" : "2026.10.0-pre"]))));
    }
    await mkdir(resolve(workspace, productDirectories.network), { recursive: true });
    await writeFile(resolve(workspace, productDirectories.network, "package.json"), JSON.stringify({ name: "vrc-packages-network", version: "2026.10.0",
      peerDependencies: { "vrc-packages-api": "0.0.0 || 2026.10.0-pre" }, devDependencies: { "vrc-packages-api": "npm:vrc-packages-api-preview@latest" } }));
    await mkdir(resolve(workspace, productDirectories.crawler), { recursive: true });
    await writeFile(resolve(workspace, productDirectories.crawler, "package.json"), JSON.stringify({ name: "vrcp-crawler-node", version: "0.0.0",
      dependencies: { "vrc-packages-api": "latest", "vrc-packages-network": networkArchiveURL("2026.10.0") } }));
    await mkdir(resolve(workspace, productDirectories.worker), { recursive: true });
    await writeFile(resolve(workspace, productDirectories.worker, "package.json"), JSON.stringify({ name: "vrcp-worker", version: "2026.10.0-pre",
      dependencies: { "vrc-packages-api": "npm:vrc-packages-api-preview@latest", "vrc-packages-network": networkArchiveURL("2026.10.0") } }));
    await writeFile(resolve(workspace, productDirectories.worker, "wrangler.toml"), 'name = "synthetic-worker"\n\n');
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
    expect(plan.tag).toBe("vrcp-network/v2026.10.1"); expect(plan.blockers).toEqual([]);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(before);
    expect(git(workspace, "status", "--porcelain")).toBe("");
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    expect(result.status).toBe("pushed"); expect(result.commit).not.toBe(before);
    expect(git(workspace, "diff", "--name-only", before, result.commit).split("\n")).toEqual([
      "config.preview.versions.json", "src-crawler/package.json", "src-worker/package.json", "src-worker/packages/network/package.json"]);
    const crawler = JSON.parse(await readFile(resolve(workspace, productDirectories.crawler, "package.json"), "utf8"));
    const worker = JSON.parse(await readFile(resolve(workspace, productDirectories.worker, "package.json"), "utf8"));
    expect(crawler.version).toBe("0.0.0"); expect(crawler.dependencies["vrc-packages-api"]).toBe("latest");
    expect(worker.version).toBe("2026.10.0-pre"); expect(worker.dependencies["vrc-packages-api"]).toBe("npm:vrc-packages-api-preview@latest");
    expect(crawler.dependencies["vrc-packages-network"]).toBe(networkArchiveURL(result.version));
    expect(worker.dependencies["vrc-packages-network"]).toBe(networkArchiveURL(result.version));
    expect(await readFile(resolve(workspace, "config.versions.json"), "utf8")).toBe(release);
    expect(retryDelivery(result.tag, workspace, git).status).toBe("already-pushed");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(result.commit);
    // Read exact historical config at the tag, not a later local bump.
    const next = JSON.parse(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8"));
    next["preview-network"] = "2026.10.2";
    await writeFile(resolve(workspace, "config.preview.versions.json"), JSON.stringify(next));
    expect(retryDelivery(result.tag, workspace, git).version).toBe("2026.10.1");
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
    git(workspace, "tag", "vrcp-network/v2026.10.1");
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

test("preview delivery works on a feature branch but stale tag/config history and release attempts stop before writes", async () => {
  await fixture(async (workspace, git) => {
    const original = git(workspace, "rev-parse", "HEAD");
    const path = resolve(workspace, "config.preview.versions.json");
    const before = await readFile(path, "utf8");
    git(workspace, "checkout", "-b", "feature-preview");
    git(workspace, "push", "-u", "origin", "feature-preview");
    expect((await planDelivery("preview", "network", workspace, now, git)).blockers).toEqual([]);
    await expect(startDelivery("release", "worker", true, workspace, now, git)).rejects.toThrow("requires main");
    expect(await readFile(path, "utf8")).toBe(before);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(original);
    const delivered = await startDelivery("preview", "network", true, workspace, now, git);
    expect(delivered.status).toBe("pushed");
    expect(delivered.version).toBe("2026.10.1");
    git(workspace, "checkout", "-b", "stale-preview", original);
    git(workspace, "push", "-u", "origin", "stale-preview");
    expect((await planDelivery("preview", "network", workspace, now, git)).blockers.join(" ")).toContain("behind a remote delivery tag");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("behind");
    expect(await readFile(path, "utf8")).toBe(before);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(original);
    // Stale main config must also stop a channel with no published tag yet.
    git(workspace, "checkout", "main");
    const mainConfig = JSON.parse(await readFile(path, "utf8"));
    mainConfig["preview-worker"] = "2026.10.2-pre";
    await writeFile(path, JSON.stringify(mainConfig));
    git(workspace, "add", "--", "config.preview.versions.json");
    git(workspace, "commit", "-m", "Synthetic authoritative version update");
    git(workspace, "push", "origin", "main");
    git(workspace, "checkout", "stale-preview");
    await expect(startDelivery("preview", "worker", true, workspace, now, git)).rejects.toThrow("behind origin main");
    expect(await readFile(path, "utf8")).toBe(before);
  });
}, 60_000);

test("an unpublished release retry cannot use a feature branch to bypass main", async () => {
  await fixture(async (workspace, git) => {
    const stopPush = (cwd: string, ...args: string[]) => {
      if (args[0] === "push" && args.includes("--atomic")) throw new Error("Synthetic rejected push");
      return git(cwd, ...args);
    };
    await expect(startDelivery("release", "worker", true, workspace, now, stopPush)).rejects.toThrow("rejected push");
    git(workspace, "checkout", "-b", "feature-release");
    expect(() => retryDelivery("cloudflare-worker/v0.0.1", workspace, git)).toThrow("requires main");
    expect(git(workspace, "ls-remote", "origin", "refs/tags/cloudflare-worker/v0.0.1")).toBe("");
  });
}, 60_000);

test("retained preview retry rejects missing or newer main config without mutating its tag", async () => {
  await fixture(async (workspace, git) => {
    git(workspace, "checkout", "-b", "feature-preview-retry");
    git(workspace, "push", "-u", "origin", "feature-preview-retry");
    const stopPush = (cwd: string, ...args: string[]) => {
      if (args[0] === "push" && args.includes("--atomic")) throw new Error("Synthetic rejected push");
      return git(cwd, ...args);
    };
    await expect(startDelivery("preview", "worker", true, workspace, now, stopPush)).rejects.toThrow("rejected push");
    const tag = "cloudflare-worker/v2026.10.1-pre";
    const tagObject = git(workspace, "rev-parse", `refs/tags/${tag}`);
    const retainedCommit = git(workspace, "rev-parse", "HEAD");
    const missingMain = (cwd: string, ...args: string[]) => {
      if (args[0] === "show" && args[1].endsWith(":config.preview.versions.json") && !args[1].startsWith(`${retainedCommit}:`)) {
        throw new Error("Synthetic missing main object");
      }
      return git(cwd, ...args);
    };
    expect(() => retryDelivery(tag, workspace, missingMain)).toThrow("fetch origin main");
    git(workspace, "checkout", "main");
    const path = resolve(workspace, "config.preview.versions.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config["preview-worker"] = "2026.10.2-pre";
    await writeFile(path, JSON.stringify(config));
    git(workspace, "add", "--", "config.preview.versions.json");
    git(workspace, "commit", "-m", "Synthetic newer main configuration without a delivery tag");
    git(workspace, "push", "origin", "main");
    git(workspace, "checkout", "feature-preview-retry");
    expect(() => retryDelivery(tag, workspace, git)).toThrow("behind origin main");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(retainedCommit);
    expect(git(workspace, "rev-parse", `refs/tags/${tag}`)).toBe(tagObject);
    expect(git(workspace, "ls-remote", "origin", `refs/tags/${tag}`)).toBe("");
    expect(git(workspace, "status", "--porcelain")).toBe("");
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
    const tag = "vrcp-network/v2026.10.1";
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

test("hosted readback streams binary hashes and rejects oversized, truncated, corrupt and unavailable bodies", async () => {
  const bytes = Buffer.from("Synthetic chunked artifact bytes"), originalFetch = globalThis.fetch;
  const asset = { name: "vrcp-crawler-node-linux", size: bytes.length,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, browser_download_url: "https://github.com/example/fixture/releases/download/test/node" };
  let body = bytes, status = 200, calls = 0;
  globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
    calls++; expect(init.signal).toBeDefined();
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < body.length; index += 3) controller.enqueue(body.subarray(index, index + 3));
      controller.close();
    } }), { status });
  }) as typeof fetch;
  try {
    const binary = await readHostedAsset(asset, true);
    expect(binary).toEqual({ size: bytes.length, sha256: asset.digest.slice(7) });
    expect((await readHostedAsset(asset, false)).bytes).toEqual(bytes);
    const before = calls;
    for (const size of [0, NaN, 1.5, 2 * 1024 ** 3]) await expect(readHostedAsset({ ...asset, size }, true)).rejects.toThrow();
    await expect(readHostedAsset({ ...asset, name: "receipt.json", size: 2 * 1024 ** 2 + 1 })).rejects.toThrow("oversized");
    await expect(readHostedAsset({ ...asset, size: 256 * 1024 ** 2 + 1 })).rejects.toThrow("oversized");
    await expect(readHostedAsset({ ...asset, digest: undefined }, true)).rejects.toThrow("digest");
    expect(calls).toBe(before);
    body = bytes.subarray(0, -1);
    await expect(readHostedAsset(asset, true)).rejects.toThrow("size differs");
    body = Buffer.concat([bytes, Buffer.from("extra")]);
    await expect(readHostedAsset(asset, true)).rejects.toThrow("declared size");
    body = Buffer.alloc(bytes.length);
    await expect(readHostedAsset(asset, true)).rejects.toThrow("digest");
    body = Buffer.alloc(0);
    await expect(readHostedAsset(asset, true)).rejects.toThrow("size differs");
    status = 404;
    await expect(readHostedAsset(asset, true)).rejects.toThrow("unavailable");
  } finally { globalThis.fetch = originalFetch; }
});

test("hosted network resolution checks the whole delivery and refuses source, tag and checksum substitution", async () => {
  const version = "2026.10.2", tag = `vrcp-network/v${version}`, commit = "a".repeat(40), object = "b".repeat(40);
  const archive = `vrc-packages-network-${version}.tgz`, repository = "SlamTheDragon/vrc-packages";
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const files = new Map<string, Buffer>([[archive, Buffer.from("Synthetic network bytes, not a published artifact")]]);
  const receipt = { name: "vrc-packages-network", version, commit, purpose: "ci-release", sha256: hash(files.get(archive)!) };
  files.set(`${archive}.json`, Buffer.from(JSON.stringify(receipt)));
  files.set("CHANGELOG.md", Buffer.from(`# VRC Packages - network ${version}\n\nChannel: preview.\nCommit: ${commit}.\n[Checked CI run](https://github.com/${repository}/actions/runs/123)\n`));
  const checksums = () => Buffer.from([...files].filter(([name]) => name !== "CHECKSUMS.sha256")
    .map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n");
  files.set("CHECKSUMS.sha256", checksums());
  const release = { id: 10, tag_name: tag, target_commitish: commit, draft: false, prerelease: true };
  const run = { head_sha: commit, head_branch: tag, event: "push", status: "completed", conclusion: "success",
    path: ".github/workflows/network.yml", head_repository: { full_name: repository } };
  let remoteObject = object, wrongURL = false, moveDuringRead = false;
  const api = async (path: string) => {
    if (path.includes("/git/ref/")) return { ref: `refs/tags/${tag}`, object: { type: "tag", sha: remoteObject } };
    if (path.includes("/git/tags/")) return { sha: remoteObject, object: { type: "commit", sha: commit } };
    if (path.includes("/assets?")) return [...files].map(([name, bytes]) => ({ name, size: bytes.length,
      digest: `sha256:${hash(bytes)}`, browser_download_url: networkArchiveURL(version).replace(archive, name)
        .replace("github.com", wrongURL ? "attacker.invalid" : "github.com") }));
    if (path.includes("/jobs?")) return { total_count: 1, jobs: [{ name: "build", status: "completed", conclusion: "success" }] };
    if (path.includes("/actions/runs/")) return run;
    return release;
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (moveDuringRead) remoteObject = "c".repeat(40);
    return new Response(files.get(new URL(String(input)).pathname.split("/").pop()!));
  }) as typeof fetch;
  try {
    const result = await readNetworkDistribution(version, undefined, api);
    expect(result.bytes).toEqual(files.get(archive)); expect(result.receipt).toEqual(receipt);
    expect(result.tagObject).toBe(object); expect(result.sourceRun).toBe("123");
    release.target_commitish = "main";
    expect((await readNetworkDistribution(version, undefined, api)).receipt.commit).toBe(commit);
    release.target_commitish = "d".repeat(40);
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("target differs");
    release.target_commitish = "main";
    await expect(readNetworkDistribution("2026.10.2-pre", undefined, api)).rejects.toThrow("suffix-free");
    release.draft = true;
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("immutable");
    release.draft = false; wrongURL = true;
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("download origin");
    wrongURL = false; run.conclusion = "failure";
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("CI source");
    run.conclusion = "success"; moveDuringRead = true;
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("tag object differs");
    moveDuringRead = false; remoteObject = object;
    files.set("CHECKSUMS.sha256", Buffer.from(`${hash(files.get(archive)!)}  ${archive}\n`));
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("coverage is incomplete");
    files.set("CHECKSUMS.sha256", checksums());
    files.set(`${archive}.json`, Buffer.from(JSON.stringify({ ...receipt, commit: "d".repeat(40) })));
    files.set("CHECKSUMS.sha256", checksums());
    await expect(readNetworkDistribution(version, undefined, api)).rejects.toThrow("Remote tag differs");
  } finally { globalThis.fetch = originalFetch; }
});

test("memory-only release checks use exact source receipts and reject bad channels, bytes and checksum coverage", async () => {
  await fixture(async (workspace, git) => {
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    git(workspace, "remote", "set-url", "origin", "https://github.com/example/fixture.git");
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const tar = "vrc-packages-network-2026.10.1.tgz";
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

test("crawler delivery checks bind streamed binaries to both receipts and hosted checksum coverage", async () => {
  await fixture(async (workspace, git) => {
    const result = await startDelivery("preview", "crawler", true, workspace, now, git);
    git(workspace, "remote", "set-url", "origin", "https://github.com/example/fixture.git");
    const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const files = new Map<string, Buffer>();
    for (const platform of ["linux", "windows"]) {
      const name = platform === "linux" ? "vrcp-crawler-node-linux" : "vrcp-crawler-node.exe";
      const bytes = Buffer.from(`Synthetic ${platform} binary`);
      files.set(name, bytes);
      files.set(`crawler-${platform}.receipt.json`, Buffer.from(JSON.stringify({ ...result, purpose: "ci-release",
        files: [{ name, size: bytes.length, sha256: hash(bytes) }] })));
    }
    const url = "https://github.com/example/fixture/actions/runs/123";
    files.set("CHANGELOG.md", Buffer.from(`Commit: ${result.commit}.\n[Checked CI run](${url})\n`));
    const checksums = () => Buffer.from([...files].filter(([name]) => name !== "CHECKSUMS.sha256")
      .map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n");
    files.set("CHECKSUMS.sha256", checksums());
    const run = { id: 123, head_sha: result.commit, head_branch: result.tag, event: "push", html_url: url,
      status: "completed", conclusion: "success", path: ".github/workflows/node-docker.yml", head_repository: { full_name: "example/fixture" } };
    const api = async (path: string) => {
      if (path.includes("/git/ref/tags/")) return { ref: `refs/tags/${result.tag}`, object: { type: "tag", sha: result.tagObject } };
      if (path.includes("/git/tags/")) return { sha: result.tagObject, object: { type: "commit", sha: result.commit } };
      if (path.includes("/runs?")) return { workflow_runs: [run] };
      if (path.includes("/jobs?")) return { total_count: 3, jobs: ["build-linux", "standalone-windows", "publish-container"]
        .map(name => ({ name, status: "completed", conclusion: "success" })) };
      if (path.includes("/assets?")) return [...files].map(([name, bytes]) => ({ name, size: bytes.length, digest: `sha256:${hash(bytes)}`,
        browser_download_url: `https://github.com/example/fixture/releases/download/trial/${name}` }));
      return { id: 123, draft: false, prerelease: true };
    };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => new Response(files.get(new URL(String(input)).pathname.split("/").pop()!))) as typeof fetch;
    try {
      const checked = await inspectDelivery(result.tag, true, workspace, api);
      expect(checked.artifactsVerified).toBe(true);
      expect(checked.sha256["vrcp-crawler-node-linux"]).toBe(hash(files.get("vrcp-crawler-node-linux")!));
      files.set("vrcp-crawler-node-linux", Buffer.from("Altered transport with updated hosted metadata"));
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("checksum entry");
      files.set("CHECKSUMS.sha256", checksums());
      await expect(inspectDelivery(result.tag, true, workspace, api)).rejects.toThrow("Binary bytes");
      expect(git(workspace, "status", "--porcelain")).toBe("");
    } finally { globalThis.fetch = previousFetch; }
  });
}, 60_000);
