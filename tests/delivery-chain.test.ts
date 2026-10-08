import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { executeDelivery, finalizeRelease as checkedFinalizeRelease, inspectConfiguredDeliveries, inspectDelivery, loadRootEnv, planDelivery, promptInteractiveDelivery, readHostedAsset, readNetworkDistribution, repositoryFromRemote, requirePublicationProof, resolveGitHubToken, retryDelivery, retryReleasePreparation, startDelivery as checkedStartDelivery, summarizeRun, trackDeliveryPipeline, triggerReconcile, verifyPredecessor } from "../scripts/delivery-chain.mjs";
import { networkArchiveURL, productDirectories, productTagPrefixes } from "../scripts/versioning.mjs";
import { checkReleaseMetadata } from "../scripts/delivery.mjs";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";

const now = new Date("2026-10-05T00:00:00Z");

// Existing fixtures model a previously verified delivery. Dedicated cases below reject absent/false proof.
async function fixturePublication(tag: string) {
  const [prefix, value] = tag.split("/v");
  const product = Object.entries(productTagPrefixes).find(([, name]) => name === prefix)?.[0];
  const channel = product === "network" || value.includes("-pre") ? "preview" : "release";
  return { tag, product, version: value, channel, artifactsVerified: true, status: product === "worker"
    ? channel === "preview" ? "preview-deployed-no-release-assets" : "release-build-only-no-production-deployment" : "release-artifacts-verified" };
}
const startDelivery = (...args: any[]) => checkedStartDelivery(...args, fixturePublication);
const finalizeRelease = (...args: any[]) => checkedFinalizeRelease(...args, fixturePublication);

test("advancement requires exact publication and artifact proof, not a tag or green-looking status", async () => {
  const base = { tag: "vrcp-api/v0.0.5", product: "package", channel: "release", version: "0.0.5", artifactsVerified: true, status: "release-artifacts-verified" };
  expect(await requirePublicationProof("release", "package", "0.0.5", "unused", async () => base)).toEqual(base);
  for (const patch of [{ artifactsVerified: false, status: "ci-failed" }, { artifactsVerified: false, status: "awaiting-npm-owner-approval" },
      { artifactsVerified: "true" }, { status: "ci-failed" }, { version: "0.0.3" }, { tag: "vrcp-api/v0.0.3" }, { channel: "preview" }, { product: "crawler" }]) {
    await expect(requirePublicationProof("release", "package", "0.0.5", "unused", async () => ({ ...base, ...patch })))
      .rejects.toThrow("proof");
  }
  await expect(requirePublicationProof("release", "package", "0.0.5", "unused", async () => { throw new Error("read unavailable"); }))
    .rejects.toThrow("read unavailable");
});

test("unpublished predecessor stops allocation before pending checkpoints or version writes", async () => {
  await fixture(async (workspace, git) => {
    const config = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    await writeFile(resolve(workspace, "pending.txt"), "Owner pending input");
    const writes: string[] = [];
    const observed = (cwd: string, ...args: string[]) => { if (["add", "commit", "checkout", "tag", "push"].includes(args[0])) writes.push(args[0]); return git(cwd, ...args); };
    await expect(checkedStartDelivery("preview", "network", true, workspace, now, observed,
      async tag => ({ ...(await fixturePublication(tag)), artifactsVerified: false, status: "ci-failed" }))).rejects.toThrow("No version or tag write ran");
    expect(writes).toEqual([]);
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(config);
    expect(git(workspace, "status", "--porcelain")).toBe("?? pending.txt");
  });
}, 60_000);

test("configured diagnostics cover exactly nine channels without hiding partial publication proof", async () => {
  await fixture(async workspace => {
    const calls: boolean[] = [];
    const inspect = async (tag: string, check: boolean) => { calls.push(check); return fixturePublication(tag); };
    const diagnosis = await inspectConfiguredDeliveries(false, workspace, inspect);
    expect(diagnosis.results).toHaveLength(9);
    expect(diagnosis.verified).toBe(false);
    expect(calls).toEqual(Array(9).fill(false));
    expect(diagnosis.results.filter(result => result.product === "network").map(result => result.channel)).toEqual(["preview"]);
    expect(diagnosis.results.some(result => result.product === "web")).toBe(false);
    expect((await inspectConfiguredDeliveries(true, workspace, inspect)).verified).toBe(true);
    const partial = await inspectConfiguredDeliveries(true, workspace, async tag => {
      if (tag.startsWith("vrcp-crawler/v")) throw new Error("Synthetic unavailable proof");
      return fixturePublication(tag);
    });
    expect(partial.results).toHaveLength(9);
    expect(partial.verified).toBe(false);
    expect(partial.results.filter(result => result.status === "proof-unavailable")).toHaveLength(2);
  });
}, 60_000);

test("preview checkpoint rejects direct edits to either authoritative version config without staging them", async () => {
  await fixture(async (workspace, git) => {
    for (const filename of ["config.versions.json", "config.preview.versions.json"]) {
      const original = await readFile(resolve(workspace, filename), "utf8");
      await writeFile(resolve(workspace, filename), original + "\n");
      const writes: string[] = [];
      const observed = (cwd: string, ...args: string[]) => { if (["add", "commit", "tag", "push"].includes(args[0])) writes.push(args[0]); return git(cwd, ...args); };
      await expect(startDelivery("preview", "network", true, workspace, now, observed)).rejects.toThrow("Pending version-config edits");
      expect(writes).toEqual([]);
      expect(await readFile(resolve(workspace, filename), "utf8")).toBe(original + "\n");
      await writeFile(resolve(workspace, filename), original);
    }
  });
}, 60_000);

test("Worker root checks archive bytes and exact config without querying or creating a Release", async () => {
  await fixture(async (workspace, git) => {
    for (const channel of ["preview", "release"]) {
      const result = channel === "preview" ? await startDelivery(channel, "worker", true, workspace, now, git)
        : await (async () => {
          const reviewed = await reviewedFixture(workspace, git, "worker");
          return finalizeRelease("worker", 7, reviewed.commit, true, workspace, git, reviewed.api);
        })();
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
  const actual = (cwd: string, ...args: string[]) => {
    const output = execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 15_000 });
    return args.includes("-z") ? output : output.trim();
  };
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
    await mkdir(resolve(workspace, productDirectories.package), { recursive: true });
    await writeFile(resolve(workspace, productDirectories.package, "package.json"), JSON.stringify({ name: "vrc-packages-api", version: "0.0.0" }));
    await mkdir(resolve(workspace, "src-crawler-client/src-tauri"), { recursive: true });
    await writeFile(resolve(workspace, productDirectories["crawler-client"], "package.json"), JSON.stringify({ name: "vrcp-crawler-client", version: "26.10.0-pre",
      dependencies: { "vrc-packages-api": "latest" } }));
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), '[package]\nname = "vrcp-crawler-client"\nversion = "26.10.0-pre" # preserve owner comment\n');
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), JSON.stringify({ version: "../package.json", bundle: { windows: { wix: { version: "26.10.0" } } } }));
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

async function reviewedFixture(workspace: string, git: (cwd: string, ...args: string[]) => string, product = "worker", method = "merge") {
  const preparation = await startDelivery("release", product, true, workspace, now, git);
  expect(preparation.status).toBe("preparation-pushed-awaiting-review");
  expect(git(workspace, "ls-remote", "origin", `refs/tags/${preparation.tag}`)).toBe("");
  expect(git(workspace, "ls-remote", "origin", "refs/heads/main")).toBe(`${preparation.base}\trefs/heads/main`);
  git(workspace, "checkout", "main");
  let trackerParent: string | undefined;
  if (method === "tracker") {
    await writeFile(resolve(workspace, "docs/scratch/task_tracker.md"), "Synthetic owner tracker checkpoint\n");
    git(workspace, "add", "--", "docs/scratch/task_tracker.md");
    git(workspace, "commit", "-m", "Synthetic tracker-only main advancement");
    trackerParent = git(workspace, "rev-parse", "HEAD");
  }
  // Only the fixture simulates the owner's manual merge. The executor never merges or pushes main.
  if (method === "merge" || method === "tracker") git(workspace, "merge", "--no-ff", preparation.branch, "-m", "Synthetic owner-reviewed promotion");
  else if (method === "squash") {
    git(workspace, "merge", "--squash", preparation.branch);
    git(workspace, "commit", "-m", "Synthetic owner-reviewed squash promotion");
  } else git(workspace, "merge", "--ff-only", preparation.branch);
  const commit = git(workspace, "rev-parse", "HEAD");
  git(workspace, "push", "origin", "main");
  const prefix = "/repos/example/fixture", pull = `${prefix}/pulls/7`;
  const parentShas = (sha: string) => git(workspace, "rev-list", "--parents", "-n", "1", sha).split(" ").slice(1).map(value => ({ sha: value }));
  const changed = git(workspace, "diff", "--name-only", preparation.base, preparation.commit).split("\n");
  const responses: Record<string, any> = {
    [pull]: { number: 7, state: "closed", merged: true, draft: false, commits: 1,
      base: { ref: "main", repo: { full_name: "example/fixture" } },
      head: { sha: preparation.commit, ref: preparation.branch, repo: { full_name: "example/fixture" } },
      merge_commit_sha: commit, merged_by: { login: "example", type: "User" }, user: { login: "example", type: "User" },
      merged_at: "2026-10-06T12:00:00Z", auto_merge: null },
    [`${pull}/commits?per_page=2`]: [{ sha: preparation.commit, parents: parentShas(preparation.commit) }],
    [`${prefix}/commits/${preparation.commit}`]: { sha: preparation.commit, parents: parentShas(preparation.commit),
      commit: { message: git(workspace, "log", "-1", "--format=%B", preparation.commit) }, files: changed.map(filename => ({ filename, status: "modified" })) },
    [`${prefix}/compare/${commit}...main`]: { status: "identical", base_commit: { sha: commit }, merge_base_commit: { sha: commit } },
    [`${pull}/reviews?per_page=100`]: [],
  };
  if (commit !== preparation.commit) responses[`${prefix}/commits/${commit}`] = { sha: commit, parents: parentShas(commit) };
  if (trackerParent) {
    responses[`${prefix}/compare/${preparation.base}...${trackerParent}`] = { status: "ahead",
      base_commit: { sha: preparation.base }, merge_base_commit: { sha: preparation.base }, total_commits: 1,
      commits: [{ sha: trackerParent }] };
    responses[`${prefix}/commits/${trackerParent}`] = { sha: trackerParent,
      files: [{ filename: "docs/scratch/task_tracker.md", status: "modified" }] };
  }
  const calls: string[] = [];
  const api = async (path: string) => {
    calls.push(path);
    if (Object.hasOwn(responses, path)) return structuredClone(responses[path]);
    const file = /^\/repos\/example\/fixture\/contents\/(config(?:\.preview)?\.versions\.json)\?ref=([a-f0-9]{40})$/.exec(path);
    if (file) return { type: "file", path: file[1], encoding: "base64", content: Buffer.from(git(workspace, "show", `${file[2]}:${file[1]}`)).toString("base64") };
    throw new Error("Unexpected synthetic release proof read");
  };
  return { preparation, commit, api, responses, calls, trackerParent };
}

test("tracker-only owner merge finalizes exact metadata but rejects any additional merged-tree changes", async () => {
  await fixture(async (workspace, git) => {
    await mkdir(resolve(workspace, "docs/scratch"), { recursive: true });
    await writeFile(resolve(workspace, "docs/scratch/task_tracker.md"), "Synthetic original tracker\n");
    git(workspace, "add", "--", "docs/scratch/task_tracker.md");
    git(workspace, "commit", "-m", "Synthetic tracker baseline");
    git(workspace, "push", "origin", "main");
    const reviewed = await reviewedFixture(workspace, git, "worker", "tracker");
    const plan = await finalizeRelease("worker", 7, reviewed.commit, false, workspace, git, reviewed.api);
    expect(plan.commit).toBe(reviewed.commit);
    expect(plan.status).toBe("finalization-plan-only");
    const proof = { ...reviewed.preparation, head: reviewed.preparation.commit,
      commit: reviewed.commit, trackerParent: reviewed.trackerParent };
    const result = await checkReleaseMetadata({ channel: "release", product: "worker", version: "0.0.1" }, proof, workspace, git);
    expect(result.version).toBe("0.0.1");
    await expect(checkReleaseMetadata({ channel: "release", product: "worker", version: "0.0.1" },
      { ...proof, trackerParent: undefined }, workspace, git)).rejects.toThrow("Merged release tree differs");
    await writeFile(resolve(workspace, "extra-runtime.txt"), "Synthetic runtime tamper\n");
    git(workspace, "add", "--", "extra-runtime.txt");
    git(workspace, "commit", "-m", "Synthetic extra merged-tree change");
    await expect(checkReleaseMetadata({ channel: "release", product: "worker", version: "0.0.1" },
      { ...proof, commit: git(workspace, "rev-parse", "HEAD") }, workspace, git)).rejects.toThrow("Merged release tree differs");
    expect(git(workspace, "tag", "--list")).toBe("");
  });
}, 60_000);

test("a previously prepared release cannot bypass predecessor publication proof at finalization", async () => {
  await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git);
    const writes: string[] = [];
    const observed = (cwd: string, ...args: string[]) => { if (["tag", "push"].includes(args[0])) writes.push(args[0]); return git(cwd, ...args); };
    await expect(checkedFinalizeRelease("worker", 7, reviewed.commit, true, workspace, observed, reviewed.api,
      async tag => ({ ...(await fixturePublication(tag)), artifactsVerified: false, status: "ci-failed" }))).rejects.toThrow("publication/artifact proof");
    expect(writes).toEqual([]);
    expect(git(workspace, "ls-remote", "origin", `refs/tags/${reviewed.preparation.tag}`)).toBe("");
  });
}, 60_000);

test("release preparation pushes one version branch, then owner-reviewed main finalization pushes only a tag", async () => {
  for (const product of ["package", "crawler", "crawler-client", "worker"]) {
    await fixture(async (workspace, git) => {
      const reviewed = await reviewedFixture(workspace, git, product);
      const before = git(workspace, "rev-parse", "HEAD");
      const versions = await readFile(resolve(workspace, "config.versions.json"), "utf8");
      const commands: string[][] = [];
      const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
      const plan = await finalizeRelease(product, 7, reviewed.commit, false, workspace, observed, reviewed.api);
      expect(plan.status).toBe("finalization-plan-only");
      expect(commands.some(args => ["tag", "push"].includes(args[0]))).toBe(false);
      const result = await finalizeRelease(product, 7, reviewed.commit, true, workspace, observed, reviewed.api);
      expect(result.status).toBe("pushed");
      expect(result.version).toBe("0.0.1");
      expect(git(workspace, "ls-remote", "origin", "refs/heads/main")).toBe(`${before}\trefs/heads/main`);
      expect(commands.filter(args => args[0] === "push")).toEqual([["push", "--no-follow-tags", "origin", `refs/tags/${result.tag}`]]);
      expect(git(workspace, "cat-file", "-p", `refs/tags/${result.tag}`)).toContain(`VRCP-Release-Head: ${reviewed.preparation.commit}`);
      expect((await finalizeRelease(product, 7, reviewed.commit, true, workspace, observed, reviewed.api)).status).toBe("already-pushed");
      expect(commands.filter(args => args[0] === "push")).toHaveLength(1);
      expect(await readFile(resolve(workspace, "config.versions.json"), "utf8")).toBe(versions);
      expect(git(workspace, "status", "--porcelain")).toBe("");
    });
  }
}, 120_000);

test("release finalizer rejects a renamed annotated object before publication", async () => {
  await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git, "worker");
    const tag = reviewed.preparation.tag;
    git(workspace, "tag", "-a", "wrong-internal-tag-name", reviewed.commit, "-m",
      `Synthetic retained annotation\n\nVRCP-Release-PR: 7\nVRCP-Release-Head: ${reviewed.preparation.commit}\nVRCP-Release-Base: ${reviewed.preparation.base}`);
    const object = git(workspace, "rev-parse", "refs/tags/wrong-internal-tag-name");
    git(workspace, "update-ref", `refs/tags/${tag}`, object);
    const commands: string[][] = [];
    const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, observed, reviewed.api))
      .rejects.toThrow("annotation header");
    expect(commands.some(args => ["tag", "push"].includes(args[0]))).toBe(false);
    expect(git(workspace, "ls-remote", "origin", `refs/tags/${tag}`)).toBe("");
  });
}, 60_000);

test("release preparation publishes only its branch even when push.followTags enables unrelated reachable tags", async () => {
  await fixture(async (workspace, git) => {
    git(workspace, "tag", "-a", "unrelated-preparation-tag", "-m", "Synthetic unrelated annotation");
    git(workspace, "config", "push.followTags", "true");
    const commands: string[][] = [];
    const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
    const result = await startDelivery("release", "worker", true, workspace, now, observed);
    expect(commands.filter(args => args[0] === "push")).toEqual([["push", "--no-follow-tags", "origin", `HEAD:refs/heads/${result.branch}`]]);
    expect(git(workspace, "ls-remote", "origin", "refs/tags/unrelated-preparation-tag")).toBe("");
    expect(git(workspace, "ls-remote", "origin", `refs/heads/${result.branch}`)).toBe(`${result.commit}\trefs/heads/${result.branch}`);
  });
}, 60_000);

test("release squash and one-commit rebase finalize their exact merged source", async () => {
  for (const method of ["squash", "rebase"]) await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git, "worker", method);
    expect((await finalizeRelease("worker", 7, reviewed.commit, true, workspace, git, reviewed.api)).commit).toBe(reviewed.commit);
  });
}, 60_000);

test("release preparation lost acknowledgments recover without main writes, tags or another patch", async () => {
  await fixture(async (workspace, git) => {
    let lost = true;
    const flaky = (cwd: string, ...args: string[]) => {
      const result = git(cwd, ...args);
      if (args[0] === "push" && lost) { lost = false; throw new Error("Synthetic lost preparation acknowledgment"); }
      return result;
    };
    const main = git(workspace, "rev-parse", "HEAD"), branch = "release/candidate/worker/v0.0.1";
    await expect(startDelivery("release", "worker", true, workspace, now, flaky)).rejects.toThrow("lost preparation");
    const retained = git(workspace, "rev-parse", "HEAD");
    const retry = await retryReleasePreparation(branch, workspace, git);
    expect(retry.status).toBe("preparation-already-pushed-awaiting-review");
    expect(retry.commit).toBe(retained);
    expect(git(workspace, "ls-remote", "origin", "refs/heads/main")).toBe(`${main}\trefs/heads/main`);
    expect(git(workspace, "ls-remote", "origin", "refs/tags/cloudflare-worker/v0.0.1")).toBe("");
    const conflict = (cwd: string, ...args: string[]) => args[0] === "ls-remote" ? `${"a".repeat(40)}\trefs/heads/${branch}` : git(cwd, ...args);
    await expect(retryReleasePreparation(branch, workspace, conflict)).rejects.toThrow("never overwrite");
  });
}, 60_000);

test("release finalization recovers a lost tag-push acknowledgment without a second tag, push or version", async () => {
  await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git);
    git(workspace, "tag", "-a", "unrelated-finalization-tag", "-m", "Synthetic unrelated annotation");
    git(workspace, "config", "push.followTags", "true");
    const versions = await readFile(resolve(workspace, "config.versions.json"), "utf8");
    const commands: string[][] = [];
    let lost = true;
    const flaky = (cwd: string, ...args: string[]) => {
      commands.push(args);
      const result = git(cwd, ...args);
      if (args[0] === "push" && lost) { lost = false; throw new Error("Synthetic lost final tag acknowledgment"); }
      return result;
    };
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, flaky, reviewed.api)).rejects.toThrow("lost final tag");
    const tag = "cloudflare-worker/v0.0.1", tagObject = git(workspace, "rev-parse", `refs/tags/${tag}`);
    const result = await finalizeRelease("worker", 7, reviewed.commit, true, workspace, flaky, reviewed.api);
    expect(result.status).toBe("already-pushed");
    expect(result.tagObject).toBe(tagObject);
    expect(result.commit).toBe(reviewed.commit);
    expect(commands.filter(args => args[0] === "tag")).toHaveLength(1);
    expect(commands.filter(args => args[0] === "push")).toEqual([["push", "--no-follow-tags", "origin", `refs/tags/${tag}`]]);
    expect(git(workspace, "ls-remote", "origin", "refs/tags/unrelated-finalization-tag")).toBe("");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(reviewed.commit);
    expect(git(workspace, "ls-remote", "origin", "refs/heads/main")).toBe(`${reviewed.commit}\trefs/heads/main`);
    expect(await readFile(resolve(workspace, "config.versions.json"), "utf8")).toBe(versions);
    expect(git(workspace, "status", "--porcelain")).toBe("");
  });
}, 60_000);

test("release finalization rejects unreviewed source, extra metadata edits, races and conflicting tags", async () => {
  await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git);
    const pull = reviewed.responses["/repos/example/fixture/pulls/7"];
    pull.merged_by.login = "another-user";
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, git, reviewed.api)).rejects.toThrow("exact merged main");
    pull.merged_by.login = "example";
    const tamper = (cwd: string, ...args: string[]) => args[0] === "show" && args[1] === `${reviewed.preparation.commit}:src-worker/package.json`
      ? git(cwd, ...args).replace('"vrcp-worker"', '"tampered"') : git(cwd, ...args);
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, tamper, reviewed.api)).rejects.toThrow("generated metadata");
    const extra = (cwd: string, ...args: string[]) => args[0] === "diff" && args.includes("--name-only")
      ? git(cwd, ...args) + "\nsrc-worker/src/worker_entry.ts" : git(cwd, ...args);
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, extra, reviewed.api)).rejects.toThrow("outside generated metadata");
    let mainReads = 0;
    const race = (cwd: string, ...args: string[]) => {
      if (args[0] === "ls-remote" && args.includes("refs/heads/main") && ++mainReads === 2) return `${"d".repeat(40)}\trefs/heads/main`;
      return git(cwd, ...args);
    };
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, race, reviewed.api)).rejects.toThrow("Main changed");
    expect(git(workspace, "tag", "--list")).toBe("");
    const wrongProof = { ...reviewed.preparation, head: reviewed.preparation.commit, commit: reviewed.commit, preparedFiles: ["config.versions.json"] };
    await expect(checkReleaseMetadata({ channel: "release", product: "worker", version: "0.0.1" }, wrongProof, workspace, git)).rejects.toThrow("outside generated metadata");
    const conflict = (cwd: string, ...args: string[]) => args[0] === "ls-remote" && args.includes("refs/heads/main")
      ? git(cwd, ...args) + `\n${"a".repeat(40)}\trefs/tags/cloudflare-worker/v0.0.1` : git(cwd, ...args);
    await expect(finalizeRelease("worker", 7, reviewed.commit, true, workspace, conflict, reviewed.api)).rejects.toThrow("never replace");
    expect(git(workspace, "tag", "--list")).toBe("");
  });
}, 60_000);

test("root chain dry-run is read-only; execute atomically commits one config and tag; retry does not bump", async () => {
  await fixture(async (workspace, git) => {
    const before = git(workspace, "rev-parse", "HEAD");
    const release = await readFile(resolve(workspace, "config.versions.json"), "utf8");
    const plan = await startDelivery("preview", "network", false, workspace, now, git);
    expect(plan.tag).toBe("vrcp-network/v2026.10.1"); expect(plan.blockers).toEqual([]);
    expect(plan.previewBranch).toBeUndefined();
    expect(git(workspace, "rev-parse", "HEAD")).toBe(before);
    expect(git(workspace, "status", "--porcelain")).toBe("");
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    expect(result.status).toBe("pushed"); expect(result.commit).not.toBe(before);
    expect(git(workspace, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(git(workspace, "ls-remote", "origin", "refs/heads/main")).toBe(`${result.commit}\trefs/heads/main`);
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

test("dirty plans stay read-only and releases, divergent origin, existing tags and SDK holds stop before writes", async () => {
  await fixture(async (workspace, git) => {
    const path = resolve(workspace, "config.preview.versions.json"), before = await readFile(path, "utf8");
    await writeFile(resolve(workspace, "owner.txt"), "Owner edits must not be committed");
    expect((await planDelivery("preview", "crawler-client", workspace, now, git)).version).toBe("26.10.1-pre");
    const head = git(workspace, "rev-parse", "HEAD");
    const dry = await startDelivery("preview", "network", false, workspace, now, git);
    expect(dry.purpose).toBe("plan-only");
    expect(dry.blockers).toContain("Worktree or index is dirty");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(head);
    expect(git(workspace, "ls-files", "owner.txt")).toBe("");
    await expect(startDelivery("release", "worker", true, workspace, now, git)).rejects.toThrow("dirty");
    expect(await readFile(path, "utf8")).toBe(before);
    git(workspace, "add", "owner.txt"); git(workspace, "commit", "-m", "Owner change not yet pushed");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("differs");
    git(workspace, "push", "origin", "main");
    git(workspace, "tag", "vrcp-network/v2026.10.1");
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("already exists");
    expect((await planDelivery("release", "worker", workspace, now, git)).publication).toBe("ci-build-only-no-production-deployment");
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

test("preview checkpoints all nonignored pending paths including spaces and renames before a separate version commit", async () => {
  await fixture(async (workspace, git) => {
    await writeFile(resolve(workspace, ".gitignore"), "ignored-secret.txt\nunchanged lock.txt\n");
    await writeFile(resolve(workspace, "unchanged lock.txt"), "Unchanged tracked input");
    await writeFile(resolve(workspace, "owner changes.txt"), "Original owner input");
    await writeFile(resolve(workspace, "rename from.txt"), "Preserved renamed input");
    git(workspace, "add", "--all");
    git(workspace, "add", "--force", "--", "unchanged lock.txt");
    git(workspace, "commit", "-m", "Synthetic pending-path baseline");
    git(workspace, "push", "origin", "main");
    const base = git(workspace, "rev-parse", "HEAD");
    git(workspace, "tag", "-a", "unrelated-preview-tag", "-m", "Synthetic unrelated annotation");
    git(workspace, "config", "push.followTags", "true");
    const previous = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    await writeFile(resolve(workspace, "owner changes.txt"), "Updated owner input");
    await mkdir(resolve(workspace, "new folder"));
    await writeFile(resolve(workspace, "new folder/new input.txt"), "New owner input");
    await writeFile(resolve(workspace, "ignored-secret.txt"), "PRIVATE_IGNORED_TEST_VALUE");
    await rename(resolve(workspace, "rename from.txt"), resolve(workspace, "rename to.txt"));
    const commands: string[][] = [];
    const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
    const result = await startDelivery("preview", "network", true, workspace, now, observed);
    expect(result.pendingCheckpoint.paths).toEqual(["new folder/new input.txt", "owner changes.txt", "rename from.txt", "rename to.txt"]);
    const checkpoint = result.pendingCheckpoint.commit;
    expect(result.pendingCheckpoint.branch).toBe("main");
    expect(git(workspace, "rev-parse", `${checkpoint}^`)).toBe(base);
    expect(git(workspace, "rev-parse", `${result.commit}^`)).toBe(checkpoint);
    expect(git(workspace, "show", `${checkpoint}:config.preview.versions.json`)).toBe(previous.trim());
    expect(git(workspace, "show", `${checkpoint}:owner changes.txt`)).toBe("Updated owner input");
    expect(git(workspace, "show", `${checkpoint}:new folder/new input.txt`)).toBe("New owner input");
    expect(git(workspace, "show", `${checkpoint}:rename to.txt`)).toBe("Preserved renamed input");
    expect(git(workspace, "ls-tree", "-r", "--name-only", result.commit).split("\n")).not.toContain("ignored-secret.txt");
    expect(await readFile(resolve(workspace, "ignored-secret.txt"), "utf8")).toBe("PRIVATE_IGNORED_TEST_VALUE");
    expect(git(workspace, "show", `${result.commit}:unchanged lock.txt`)).toBe("Unchanged tracked input");
    expect(commands.filter(args => args[0] === "push")).toEqual([
      ["push", "--no-follow-tags", "origin", "HEAD:refs/heads/main"],
      ["push", "--atomic", "--no-follow-tags", "origin", "HEAD:refs/heads/main", `refs/tags/${result.tag}`]
    ]);
    expect(git(workspace, "ls-remote", "origin", "refs/tags/unrelated-preview-tag")).toBe("");
    expect(commands.filter(args => args[0] === "commit")).toHaveLength(2);
    expect(commands.some(args => args.includes("--amend") || args.includes("--force"))).toBe(false);
    expect(git(workspace, "diff", "--name-only", checkpoint, result.commit).split("\n")).toEqual([
      "config.preview.versions.json", "src-crawler/package.json", "src-worker/package.json", "src-worker/packages/network/package.json"]);
    expect(git(workspace, "status", "--porcelain")).toBe("");
  });
}, 60_000);

test("a new pending file appearing during add retains staging and stops before any checkpoint commit or bump", async () => {
  await fixture(async (workspace, git) => {
    const before = git(workspace, "rev-parse", "HEAD");
    const versions = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    await writeFile(resolve(workspace, "printed pending input.txt"), "Original checkpoint input");
    const commands: string[][] = [];
    const race = (cwd: string, ...args: string[]) => {
      commands.push(args);
      if (args[0] === "add" && args.includes("--all")) {
        writeFileSync(resolve(workspace, "unlisted concurrent input.txt"), "Concurrent input must remain staged for inspection");
      }
      return git(cwd, ...args);
    };
    await expect(startDelivery("preview", "network", true, workspace, now, race)).rejects.toThrow("Pending paths changed during staging");
    expect(commands.some(args => ["commit", "push", "tag", "reset", "restore", "checkout"].includes(args[0]))).toBe(false);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(before);
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(versions);
    expect(git(workspace, "diff", "--cached", "--name-only", "-z").split("\0").filter(Boolean)).toEqual([
      "printed pending input.txt", "unlisted concurrent input.txt"
    ]);
    expect(git(workspace, "tag", "--list")).toBe("");
  });
}, 60_000);

test("dirty stale or divergent preview plans reject before staging, committing or pushing pending owner files", async () => {
  for (const reason of ["stale", "divergent"]) await fixture(async (workspace, git) => {
    const original = git(workspace, "rev-parse", "HEAD");
    git(workspace, "checkout", "-b", "feature-pending");
    git(workspace, "push", "origin", "feature-pending");
    git(workspace, "checkout", "main");
    if (reason === "stale") {
      const path = resolve(workspace, "config.preview.versions.json");
      const config = JSON.parse(await readFile(path, "utf8"));
      config["preview-worker"] = "2026.10.2-pre";
      await writeFile(path, JSON.stringify(config));
    } else await writeFile(resolve(workspace, "synchronized update.txt"), "Unrelated synchronized input");
    git(workspace, "add", "--all");
    git(workspace, "commit", "-m", "Synthetic remote update before dirty delivery");
    git(workspace, "push", "origin", "main");
    if (reason === "divergent") git(workspace, "push", "origin", "HEAD:refs/heads/feature-pending");
    git(workspace, "checkout", "feature-pending");
    await writeFile(resolve(workspace, "pending owner input.txt"), "Preserve uncommitted owner input");
    const status = git(workspace, "status", "--porcelain=v1", "-z", "--untracked-files=all");
    const versions = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    const commands: string[][] = [];
    const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
    await expect(startDelivery("preview", "worker", true, workspace, now, observed)).rejects.toThrow(reason === "stale" ? "behind origin main" : "Origin branch differs");
    expect(commands.some(args => ["add", "commit", "push", "tag", "checkout"].includes(args[0]))).toBe(false);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(original);
    expect(git(workspace, "status", "--porcelain=v1", "-z", "--untracked-files=all")).toBe(status);
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(versions);
  });
}, 60_000);

test("indexed ignored pending inputs reject without unstaging them or committing their contents", async () => {
  await fixture(async (workspace, git) => {
    await writeFile(resolve(workspace, ".gitignore"), "ignored-secret.txt\n");
    git(workspace, "add", ".gitignore");
    git(workspace, "commit", "-m", "Synthetic ignored-input rule");
    git(workspace, "push", "origin", "main");
    await writeFile(resolve(workspace, "ignored-secret.txt"), "PRIVATE_INDEXED_TEST_VALUE");
    git(workspace, "add", "--force", "--", "ignored-secret.txt");
    const head = git(workspace, "rev-parse", "HEAD");
    const status = git(workspace, "status", "--porcelain=v1", "-z", "--untracked-files=all");
    const commands: string[][] = [];
    const observed = (cwd: string, ...args: string[]) => { commands.push(args); return git(cwd, ...args); };
    await expect(startDelivery("preview", "network", true, workspace, now, observed)).rejects.toThrow("Indexed ignored pending files");
    expect(commands.some(args => ["add", "commit", "push", "tag"].includes(args[0]))).toBe(false);
    expect(git(workspace, "rev-parse", "HEAD")).toBe(head);
    expect(git(workspace, "status", "--porcelain=v1", "-z", "--untracked-files=all")).toBe(status);
    expect(await readFile(resolve(workspace, "ignored-secret.txt"), "utf8")).toBe("PRIVATE_INDEXED_TEST_VALUE");
  });
}, 60_000);

test("failed pending push retains its separate commit and requires a same-branch normal push before any bump", async () => {
  await fixture(async (workspace, git) => {
    git(workspace, "checkout", "-b", "feature-pending-recovery");
    git(workspace, "push", "origin", "feature-pending-recovery");
    const before = git(workspace, "rev-parse", "HEAD");
    const versions = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    await writeFile(resolve(workspace, "pending owner input.txt"), "Preserve checkpoint input");
    const commands: string[][] = [];
    const failedPush = (cwd: string, ...args: string[]) => {
      commands.push(args);
      if (args[0] === "push") throw new Error("Synthetic refused pending push");
      return git(cwd, ...args);
    };
    await expect(startDelivery("preview", "network", true, workspace, now, failedPush)).rejects.toThrow('git push --no-follow-tags origin "HEAD:refs/heads/feature-pending-recovery"');
    const retained = git(workspace, "rev-parse", "HEAD");
    expect(retained).not.toBe(before);
    expect(git(workspace, "rev-parse", `${retained}^`)).toBe(before);
    expect(git(workspace, "ls-remote", "origin", "refs/heads/feature-pending-recovery")).toBe(`${before}\trefs/heads/feature-pending-recovery`);
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(versions);
    expect(git(workspace, "tag", "--list")).toBe("");
    expect(commands.filter(args => args[0] === "commit")).toHaveLength(1);
    await expect(startDelivery("preview", "network", true, workspace, now, git)).rejects.toThrow("Origin branch differs");
    expect(git(workspace, "rev-parse", "HEAD")).toBe(retained);
    git(workspace, "push", "--no-follow-tags", "origin", "HEAD:refs/heads/feature-pending-recovery");
    const result = await startDelivery("preview", "network", true, workspace, now, git);
    expect(result.version).toBe("2026.10.1");
    expect(result.pendingCheckpoint).toBeUndefined();
    expect(git(workspace, "rev-parse", `${result.commit}^`)).toBe(retained);
    expect(git(workspace, "status", "--porcelain")).toBe("");
  });
}, 60_000);

test("preview rechecks remote freshness after pushing pending files and stops before the version write", async () => {
  await fixture(async (workspace, git) => {
    await writeFile(resolve(workspace, "pending owner input.txt"), "Preserve checkpoint input");
    const versions = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    const commands: string[][] = [];
    let pushed = false;
    const race = (cwd: string, ...args: string[]) => {
      commands.push(args);
      const result = git(cwd, ...args);
      if (args[0] === "push") pushed = true;
      if (pushed && args[0] === "ls-remote" && args.includes("refs/heads/main")) {
        return `${result}\n${"a".repeat(40)}\trefs/tags/vrcp-network/v2026.10.9`;
      }
      return result;
    };
    await expect(startDelivery("preview", "network", true, workspace, now, race)).rejects.toThrow("Pending checkpoint pushed; delivery blocked");
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(versions);
    expect(commands.filter(args => args[0] === "commit")).toHaveLength(1);
    expect(commands.filter(args => args[0] === "push")).toEqual([["push", "--no-follow-tags", "origin", "HEAD:refs/heads/main"]]);
    expect(git(workspace, "tag", "--list")).toBe("");
    expect(git(workspace, "status", "--porcelain")).toBe("");
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

test("an unpublished release retry cannot use a feature branch or an unproven tag to bypass promotion", async () => {
  await fixture(async (workspace, git) => {
    const reviewed = await reviewedFixture(workspace, git);
    const tag = "cloudflare-worker/v0.0.1";
    git(workspace, "tag", "-a", tag, "-m", "Unproven synthetic tag");
    expect(() => retryDelivery(tag, workspace, git)).toThrow("proof trailer");
    git(workspace, "tag", "-d", tag);
    git(workspace, "tag", "-a", tag, "-m", `Synthetic proof locator\n\nVRCP-Release-PR: 7\nVRCP-Release-Head: ${reviewed.preparation.commit}\nVRCP-Release-Base: ${reviewed.preparation.base}`);
    git(workspace, "checkout", "-b", "feature-release");
    await expect(retryDelivery(tag, workspace, git)).rejects.toThrow("requires clean main");
    expect(git(workspace, "ls-remote", "origin", `refs/tags/${tag}`)).toBe("");
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

test("binary ranges hash every byte and reject shifted, truncated or ignored later ranges", async () => {
  const bytes = Buffer.alloc(8 * 1024 ** 2 + 7, 42);
  const asset = { name: "node", size: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    browser_download_url: "https://github.com/example/fixture/releases/download/test/node" };
  const originalFetch = globalThis.fetch;
  let mode = "valid", calls: string[] = [];
  globalThis.fetch = (async (_input: unknown, init: RequestInit) => {
    const range = new Headers(init.headers).get("range")!;
    calls.push(range);
    const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range)!;
    const first = Number(start), last = Number(end);
    if (mode === "ignore-later" && first > 0) return new Response(bytes);
    const part = bytes.subarray(first, last + 1 - (mode === "truncated" ? 1 : 0));
    return new Response(part, { status: 206, headers: {
      "content-range": `bytes ${first + (mode === "shifted" ? 1 : 0)}-${last}/${bytes.length}` } });
  }) as typeof fetch;
  try {
    expect(await readHostedAsset(asset, true)).toEqual({ size: bytes.length, sha256: asset.digest.slice(7) });
    expect(calls).toEqual(["bytes=0-8388607", "bytes=8388608-8388614"]);
    for (mode of ["shifted", "truncated", "ignore-later"]) {
      calls = [];
      await expect(readHostedAsset(asset, true)).rejects.toThrow("range");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("hosted network resolution checks the whole delivery and refuses source, tag and checksum substitution", async () => {
  const version = "2026.10.2", tag = `vrcp-network/v${version}`, commit = "a".repeat(40), object = "b".repeat(40);
  const archive = `vrc-packages-network-${version}.tgz`, repository = "SlamTheDragon/vrc-packages";
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const files = new Map<string, Buffer>([[archive, Buffer.from("Synthetic network bytes, not a published artifact")]]);
  const receipt = { name: "vrc-packages-network", version, commit, purpose: "ci-release", sha256: hash(files.get(archive)!) };
  files.set(`${archive}.json`, Buffer.from(JSON.stringify(receipt)));
  files.set("CHANGELOG.md", Buffer.from(`# vrc-packages-network ${version}\n\nChannel: preview.\nCommit: ${commit}.\n[Checked CI run](https://github.com/${repository}/actions/runs/123)\n`));
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
    const canonicalNotes = files.get("CHANGELOG.md")!;
    files.set("CHANGELOG.md", Buffer.from(canonicalNotes.toString().replace("# vrc-packages-network", "# VRC Packages - network")));
    files.set("CHECKSUMS.sha256", checksums());
    expect((await readNetworkDistribution(version, undefined, api)).receipt.commit).toBe(commit);
    files.set("CHANGELOG.md", canonicalNotes);
    files.set("CHECKSUMS.sha256", checksums());
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

test("verifyPredecessor enforces verified predecessor publication before CI build", async () => {
  await fixture(async (workspace, git) => {
    const preview = await startDelivery("preview", "crawler", true, workspace, now, git);
    const annotation = git(workspace, "cat-file", "-p", `refs/tags/${preview.tag}`);
    expect(annotation).toContain("VRCP-Previous-Version: 2026.10.0-pre");

    // Initial placeholder version skips without publication fetch
    const skipped = await verifyPredecessor(preview.tag, workspace, git);
    expect(skipped.skipped).toBe(true);
    expect(skipped.reason).toBe("initial-placeholder");

    // Missing trailer fails closed
    git(workspace, "tag", "-a", "-f", preview.tag, preview.commit, "-m", "Untrailed manual tag");
    await expect(verifyPredecessor(preview.tag, workspace, git)).rejects.toThrow("missing VRCP-Previous-Version");

    // Non-placeholder trailer verifies predecessor
    git(workspace, "tag", "-a", "-f", preview.tag, preview.commit, "-m", `Trailed tag\n\nVRCP-Previous-Version: 2026.10.6-pre`);
    let checkedTag = "";
    const mockProof = async (tag: string) => {
      checkedTag = tag;
      return { tag, product: "crawler", version: "2026.10.6-pre", channel: "preview", artifactsVerified: true, status: "release-artifacts-verified" };
    };
    const verified = await verifyPredecessor(preview.tag, workspace, git, mockProof as any);
    expect(verified.skipped).toBe(false);
    expect(checkedTag).toBe("vrcp-crawler/v2026.10.6-pre");

    // Failed predecessor halts verification
    const failingProof = async (tag: string) => {
      return { tag, product: "crawler", version: "2026.10.6-pre", channel: "preview", artifactsVerified: false, status: "ci-failed" };
    };
    await expect(verifyPredecessor(preview.tag, workspace, git, failingProof as any)).rejects.toThrow("publication/artifact proof");
  });
}, 60_000);

test("test skipping is strictly prohibited on release routes in delivery chain", async () => {
  await fixture(async (workspace, git) => {
    // planDelivery on release with skipTests adds blocker
    const releasePlan = await planDelivery("release", "crawler", workspace, now, git, false, true);
    expect(releasePlan.blockers).toContain("Tests cannot be disabled on release/production routes");

    // startDelivery on release with skipTests throws
    await expect(startDelivery("release", "crawler", false, workspace, now, git, false, true))
      .rejects.toThrow("Tests cannot be disabled on release/production routes");

    // planDelivery on preview with skipTests succeeds and records skipTests flag
    const previewPlan = await planDelivery("preview", "crawler", workspace, now, git, false, true);
    expect(previewPlan.skipTests).toBe(true);
    expect(previewPlan.blockers).not.toContain("Tests cannot be disabled on release/production routes");
  });
});

test("executeDelivery validates argument order, channel restrictions, and test-skip flags", async () => {
  await fixture(async (workspace, git) => {
    // Rejects invalid channel or product
    await expect(executeDelivery("invalid", "package", { workspace, git, publicationProof: fixturePublication, watch: false }))
      .rejects.toThrow("Invalid arguments");
    await expect(executeDelivery("preview", "invalid", { workspace, git, publicationProof: fixturePublication, watch: false }))
      .rejects.toThrow("Unknown or unsupported product");

    // Rejects network on release channel regardless of arg order
    await expect(executeDelivery("network", "release", { workspace, git, publicationProof: fixturePublication, watch: false }))
      .rejects.toThrow("Product 'network' is available only on the preview channel");
    await expect(executeDelivery("release", "network", { workspace, git, publicationProof: fixturePublication, watch: false }))
      .rejects.toThrow("Product 'network' is available only on the preview channel");

    // Prohibits skipTests on release
    await expect(executeDelivery("crawler", "release", { workspace, git, publicationProof: fixturePublication, watch: false, skipTests: true }))
      .rejects.toThrow("Tests cannot be disabled on release/production routes");

    // Executes preview delivery with watch: false when order is (product, channel)
    const result1 = await executeDelivery("crawler", "preview", {
      workspace,
      git,
      publicationProof: fixturePublication,
      watch: false,
      now
    });
    expect(result1.tag).toBe("vrcp-crawler/v2026.10.1-pre");
    expect(result1.status).toBe("pushed");

    // Executes release delivery (candidate branch) when order is (channel, product)
    const result2 = await executeDelivery("release", "crawler", {
      workspace,
      git,
      publicationProof: fixturePublication,
      watch: false,
      now
    });
    expect(result2.tag).toBe("vrcp-crawler/v0.0.1");
    expect(result2.branch).toBe("release/candidate/crawler/v0.0.1");
    expect(result2.pullRequestURL).toContain("release%2Fcandidate%2Fcrawler%2Fv0.0.1");
  });
}, 60_000);

test("triggerReconcile dispatches sdk-release-reconcile workflow", async () => {
  await fixture(async (workspace, git) => {
    const previousToken = process.env.GH_TOKEN;
    try {
      process.env.GH_TOKEN = "";
      process.env.GITHUB_TOKEN = "";
      delete process.env.RELEASE_TOKEN;
      await expect(triggerReconcile(workspace, fetch as any, git as any)).rejects.toThrow("requires GH_TOKEN or GITHUB_TOKEN");

      process.env.GH_TOKEN = "fixture-token-123";
      let dispatchedUrl = "", dispatchedBody: any, dispatchedHeaders: any;
      const mockFetch: any = async (url: string, options: any) => {
        dispatchedUrl = url;
        dispatchedBody = JSON.parse(options.body);
        dispatchedHeaders = options.headers;
        return new Response("", { status: 204 });
      };

      const result = await triggerReconcile(workspace, mockFetch, git as any);
      expect(result.status).toBe("dispatched");
      expect(result.workflow).toBe("sdk-release-reconcile.yml");
      expect(dispatchedUrl).toContain("/actions/workflows/sdk-release-reconcile.yml/dispatches");
      expect(dispatchedBody).toEqual({ ref: "main" });
      expect(dispatchedHeaders.authorization).toBe("Bearer fixture-token-123");
    } finally {
      process.env.GH_TOKEN = previousToken;
    }
  });
});

test("trackDeliveryPipeline locates workflow run and inspects delivery", async () => {
  await fixture(async (workspace, git) => {
    const preview = await checkedStartDelivery("preview", "crawler", true, workspace, now, git, fixturePublication);
    let inspectedTag = "";
    const mockInspect = async (tag: string, check: boolean) => {
      inspectedTag = tag;
      return { tag, status: "release-artifacts-verified", artifactsVerified: true };
    };

    const mockApi = async (path: string) => {
      if (path.includes("/actions/workflows/") && path.includes("/runs?")) {
        return {
          workflow_runs: [{
            id: 8888,
            head_sha: preview.commit,
            head_branch: preview.tag,
            html_url: "https://github.com/example/fixture/actions/runs/8888"
          }]
        };
      }
      if (path.endsWith("/actions/runs/8888")) {
        return { id: 8888, status: "completed", conclusion: "success", html_url: "https://github.com/example/fixture/actions/runs/8888" };
      }
      if (path.endsWith("/actions/runs/8888/jobs?per_page=100")) {
        return { jobs: [{ name: "build-linux", status: "completed", conclusion: "success" }] };
      }
      return {};
    };

    const messages: string[] = [];
    const tracked = await trackDeliveryPipeline(preview.tag, {
      workspace,
      git: git as any,
      api: mockApi as any,
      pollIntervalMs: 10,
      timeoutMs: 5000,
      onProgress: msg => messages.push(msg),
      inspect: mockInspect as any
    });

    expect(tracked.artifactsVerified).toBe(true);
    expect(inspectedTag).toBe(preview.tag);
    expect(messages.some(m => m.includes("Found workflow run #8888"))).toBe(true);
    expect(messages.some(m => m.includes("Workflow run #8888 succeeded"))).toBe(true);
  });
}, 60_000);

test("resolveGitHubToken resolves from env and workspace .env", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "vrcp-env-test-"));
  try {
    writeFileSync(resolve(dir, ".env"), "GH_TOKEN=test-token-from-env-file\n");
    const originalToken = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.RELEASE_TOKEN;
    try {
      const token = resolveGitHubToken(dir);
      expect(token).toBe("test-token-from-env-file");
    } finally {
      if (originalToken) process.env.GH_TOKEN = originalToken;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("promptInteractiveDelivery aborts if changelog summary is not written", async () => {
  const mockCleanGit = (_cwd: string, ...args: string[]) => {
    if (args[0] === "status" && args.includes("--porcelain")) return "";
    if (args[0] === "symbolic-ref") return "main";
    return "";
  };
  const answers: Record<string, string> = {
    "Select product": "package",
    "Select deployment channel": "preview",
    "written in CHANGELOG.md": "n"
  };
  const askFn = async (query: string) => {
    for (const [key, val] of Object.entries(answers)) {
      if (query.includes(key)) return val;
    }
    return "y";
  };
  await expect(promptInteractiveDelivery({ askFn, git: mockCleanGit, onProgress: () => {} }))
    .rejects.toThrow("Delivery aborted: Please write a summary for the release in CHANGELOG.md before proceeding.");
});

test("promptInteractiveDelivery aborts if no changes are confirmed in preparedness self-check", async () => {
  const mockCleanGit = (_cwd: string, ...args: string[]) => {
    if (args[0] === "status" && args.includes("--porcelain")) return "";
    if (args[0] === "symbolic-ref") return "main";
    return "";
  };
  const answers: Record<string, string> = {
    "Select product": "package",
    "Select deployment channel": "preview",
    "written in CHANGELOG.md": "y",
    "new features": "n",
    "bug fixes": "n",
    "other changes": "n"
  };
  const askFn = async (query: string) => {
    for (const [key, val] of Object.entries(answers)) {
      if (query.includes(key)) return val;
    }
    return "n";
  };
  await expect(promptInteractiveDelivery({ askFn, git: mockCleanGit, onProgress: () => {} }))
    .rejects.toThrow("Delivery aborted: Preparedness self-check failed (no features, bug fixes, or changes recorded).");
});

test("promptInteractiveDelivery aborts if dirty worktree commit is declined", async () => {
  const mockGit = (_cwd: string, ...args: string[]) => {
    if (args[0] === "status" && args.includes("--porcelain")) return "M dirty-file.ts";
    if (args[0] === "symbolic-ref") return "main";
    return "";
  };
  const answers: Record<string, string> = {
    "Select product": "package",
    "Select deployment channel": "preview",
    "Commit remaining work": "n"
  };
  const askFn = async (query: string) => {
    for (const [key, val] of Object.entries(answers)) {
      if (query.includes(key)) return val;
    }
    return "y";
  };
  await expect(promptInteractiveDelivery({ askFn, git: mockGit, onProgress: () => {} }))
    .rejects.toThrow("Delivery aborted: Worktree is dirty. Please commit or stash changes before delivering.");
});

test("executeDelivery accepts case-insensitive product and channel arguments", async () => {
  await expect(executeDelivery("UnknownProduct", "Preview", { interactive: false }))
    .rejects.toThrow("Unknown or unsupported product: unknownproduct");
});

test("promptInteractiveDelivery accepts case-insensitive initial arguments", async () => {
  const mockCleanGit = (_cwd: string, ...args: string[]) => {
    if (args[0] === "status" && args.includes("--porcelain")) return "";
    if (args[0] === "symbolic-ref") return "main";
    return "";
  };
  const askFn = async (_q: string) => "n"; // abort on changelog summary
  await expect(promptInteractiveDelivery({ firstArg: "Crawler", secondArg: "Preview", askFn, git: mockCleanGit, onProgress: () => {} }))
    .rejects.toThrow("Delivery aborted: Please write a summary for the release in CHANGELOG.md before proceeding.");
});


