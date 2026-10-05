import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { bumpVersion, networkArchiveURL, nextVersion, productDirectories, productTagPrefixes, readVersionConfig, sdkPackageNames, versionFiles } from "./versioning.mjs";
import { checkSDKPublicationVersion, selectTag } from "./delivery.mjs";
import { allowedBinary, checkedAssetBytes, checkSourceRun, checkRemoteTag, sameSourceRunLink, sourceRunID } from "./release-assets.mjs";
import { checkWorkerArtifacts, downloadActionsArchive } from "./worker-artifacts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflows = { package: "vrc-packages-api", network: "network", crawler: "node-docker",
  "crawler-client": "node-client", worker: "cloudflare-worker" };

function runGit(workspace, ...args) {
  try {
    return execFileSync("git", args, { cwd: workspace, encoding: "utf8", timeout: 60_000,
      stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" } }).trim();
  } catch { throw new Error(`Git ${args[0]} failed. Inspect repository state before retrying; no rollback or tag replacement ran.`); }
}

export function repositoryFromRemote(remote) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error("Delivery requires a GitHub origin without embedded credentials");
  return match[1];
}

function newerRemoteVersion(channel, product, version, refs) {
  const prefix = `refs/tags/${productTagPrefixes[product]}/v`;
  return refs.some(line => {
    const ref = line.split("\t")[1];
    if (!ref?.startsWith(prefix) || ref.endsWith("^{}")) return false;
    const candidate = ref.slice(prefix.length);
    if (semver.valid(candidate) !== candidate) return false;
    const selectedChannel = product === "network" || semver.prerelease(candidate) ? "preview" : "release";
    return selectedChannel === channel && semver.gt(candidate, version);
  });
}

/** Read-only planning. Only --execute allocates a patch and triggers tagged CI. */
export async function planDelivery(channel, product, workspace = root, now = new Date(), git = runGit) {
  if (!Object.hasOwn(workflows, product)) throw new Error("Product delivery is disabled or unknown. Website hosting remains deferred.");
  const { config, configPath } = await readVersionConfig(channel, workspace);
  const previous = config[`${channel}-${product}`];
  const version = nextVersion(channel, product, "patch", previous, now);
  if (product === "package") checkSDKPublicationVersion(version, channel,
    sdkPackageNames[channel]);
  const branch = git(workspace, "symbolic-ref", "--short", "HEAD");
  const repository = repositoryFromRemote(git(workspace, "remote", "get-url", "origin"));
  const tag = `${productTagPrefixes[product]}/v${version}`;
  const blockers = [];
  if (channel === "release" && branch !== "main") blockers.push("Release delivery requires main after reviewed promotion");
  if (git(workspace, "status", "--porcelain")) blockers.push("Worktree or index is dirty");
  if (git(workspace, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`)) blockers.push("Local tag already exists");
  const refs = git(workspace, "ls-remote", "origin", `refs/heads/${branch}`, "refs/heads/main",
    `refs/tags/${productTagPrefixes[product]}/v*`).split("\n");
  const head = git(workspace, "rev-parse", "HEAD");
  if (!refs.includes(`${head}\trefs/heads/${branch}`)) blockers.push("Origin branch differs from HEAD or does not exist");
  if (refs.some(line => line.endsWith(`\trefs/tags/${tag}`))) blockers.push("Remote tag already exists");
  if (newerRemoteVersion(channel, product, previous, refs)) blockers.push("Version config is behind a remote delivery tag; synchronize before bumping");
  const main = refs.find(line => line.endsWith("\trefs/heads/main"))?.split("\t")[0];
  if (!/^[a-f0-9]{40}$/.test(main ?? "")) blockers.push("Origin main is unavailable");
  else {
    try {
      const mainConfig = JSON.parse(git(workspace, "show", `${main}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`));
      const mainVersion = mainConfig[`${channel}-${product}`];
      if (semver.valid(mainVersion) !== mainVersion) throw new Error("Invalid main version");
      if (semver.lt(previous, mainVersion)) blockers.push("Version config is behind origin main; synchronize before bumping");
    } catch { blockers.push("Cannot read current origin main version config; fetch origin main before delivery"); }
  }
  const other = (await readVersionConfig(channel === "preview" ? "release" : "preview", workspace)).config;
  if (other[`${channel === "preview" ? "release" : "preview"}-${product}`] === version) blockers.push("Channel tag would be ambiguous");
  return { channel, product, previous, version, tag, branch, repository, head, configPath, blockers,
    workflow: `${workflows[product]}.yml`, purpose: "plan-only",
    delivery: product === "worker" && channel === "release" ? "ci-build-only-no-production-deployment" : "tagged-delivery" };
}

/** Keep failed local commit/tag state so an exact retry cannot allocate another version. */
export async function startDelivery(channel, product, execute = false, workspace = root, now = new Date(), git = runGit) {
  const plan = await planDelivery(channel, product, workspace, now, git);
  if (!execute) return plan;
  if (plan.blockers.length) throw new Error(`Delivery blocked: ${plan.blockers.join("; ")}`);
  // Recheck immediately before writes. A later race still cannot force an origin ref.
  if (git(workspace, "status", "--porcelain") || git(workspace, "rev-parse", "HEAD") !== plan.head) {
    throw new Error("Repository changed after planning");
  }
  const result = await bumpVersion(channel, product, "patch", workspace, now);
  if (result.version !== plan.version) throw new Error("Config changed after planning. Inspect it before retrying.");
  const metadata = await versionFiles("sync", channel, product, workspace);
  const paths = [plan.configPath, ...metadata.changed];
  git(workspace, "add", "--", ...paths);
  git(workspace, "commit", "--only", "-m", `Deliver ${product} ${channel} ${plan.version}`, "--", ...paths);
  git(workspace, "tag", "-a", plan.tag, "-m", `VRC Packages ${product} ${channel} ${plan.version}`);
  return retryDelivery(plan.tag, workspace, git);
}

function sourceTag(tag, workspace, git = runGit) {
  if (typeof tag !== "string" || !/^[a-z-]+\/v[0-9][0-9A-Za-z.+-]*$/.test(tag)) throw new Error("Expected an exact product tag");
  const commit = git(workspace, "rev-parse", `refs/tags/${tag}^{commit}`);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid tag commit");
  const configs = Object.fromEntries(["release", "preview"].map(channel => [channel,
    JSON.parse(git(workspace, "show", `${commit}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`))]));
  return { ...selectTag(tag, configs, true), tag, commit, tagObject: git(workspace, "rev-parse", `refs/tags/${tag}`) };
}

export function retryDelivery(tag, workspace = root, git = runGit) {
  const selected = sourceTag(tag, workspace, git);
  if (!Object.hasOwn(workflows, selected.product)) {
    throw new Error("This product/channel has no authorized tagged delivery");
  }
  const repository = repositoryFromRemote(git(workspace, "remote", "get-url", "origin"));
  const oid = selected.tagObject;
  const remote = git(workspace, "ls-remote", "origin", `refs/tags/${tag}`);
  if (remote && remote !== `${oid}\trefs/tags/${tag}`) throw new Error("Remote tag differs. Replacement needs separate owner authorization.");
  if (!remote) {
    if (git(workspace, "status", "--porcelain") || git(workspace, "rev-parse", "HEAD") !== selected.commit) {
      throw new Error("Retry requires a clean checkout at the tag commit");
    }
    const branch = git(workspace, "symbolic-ref", "--short", "HEAD");
    if (selected.channel === "release" && branch !== "main") throw new Error("Release retry requires main after reviewed promotion");
    const versions = git(workspace, "ls-remote", "origin", `refs/tags/${productTagPrefixes[selected.product]}/v*`).split("\n");
    if (newerRemoteVersion(selected.channel, selected.product, selected.version, versions)) {
      throw new Error("Newer remote delivery exists. Inspect the retained local tag; do not replace it or skip a patch.");
    }
    // Atomic normal pushes fail on divergence and existing tags. Never replace a tag.
    git(workspace, "push", "--atomic", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`);
  }
  return { ...selected, repository, status: remote ? "already-pushed" : "pushed",
    next: [`bun run delivery:status ${tag}`, `bun run delivery:check ${tag}`] };
}

export function summarizeRun(run, jobs, release, product, channel = "preview") {
  if (run.status !== "completed") return "ci-active-or-awaiting-environment";
  if (run.conclusion !== "success") return "ci-failed";
  if (product === "worker") {
    if (channel === "release") return jobs.some(job => job.name === "build" && job.conclusion === "success") &&
      jobs.some(job => job.name === "deploy" && job.conclusion === "skipped")
      ? "release-build-only-no-production-deployment" : "build-only-boundary-not-proved";
    return jobs.some(job => job.name === "deploy" && job.conclusion === "success")
      ? "preview-deployed-no-release-assets" : "deployment-not-proved";
  }
  if (release?.draft) return product === "package" ? "awaiting-npm-owner-approval" : "release-draft";
  return release ? "released-artifacts-unverified" : "publication-not-proved";
}

function githubReader(workspace) {
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      const credential = execFileSync("git", ["credential", "fill"], { cwd: workspace,
        input: "protocol=https\nhost=github.com\n\n", encoding: "utf8", timeout: 15_000, stdio: "pipe",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" } });
      token = credential.split(/\r?\n/).find(line => line.startsWith("password="))?.slice(9);
    } catch { /* Public metadata checks can continue without credentials. */ }
  }
  return async (path, missing = false, format = "json") => {
    if (format === "archive") {
      const match = /^\/repos\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/actions\/artifacts\/([1-9][0-9]*)\/zip$/.exec(path);
      if (!match) throw new Error("Invalid Actions archive API path");
      return downloadActionsArchive(match[1], Number(match[2]), token);
    }
    const response = await fetch(`https://api.github.com${path}`, { redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/vnd.github+json", "user-agent": "VRCPDelivery", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub metadata request failed (${response.status}). No mutation ran.`);
    return response.json();
  };
}

/** Hash binaries incrementally. Only bounded receipts and package archives stay in memory. */
export async function readHostedAsset(asset, binary = false) {
  const metadata = /\.(?:json|md|sha256)$/.test(asset.name);
  const limit = binary ? 2 * 1024 ** 3 - 1 : metadata ? 2 * 1024 ** 2 : 256 * 1024 ** 2;
  if (!Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > limit || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "")) {
    throw new Error("Hosted artifact is missing, oversized or lacks a digest");
  }
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(binary ? 1_800_000 : 180_000) });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("Hosted artifact is unavailable");
  }
  const reader = response.body.getReader(), chunks = [], digest = createHash("sha256");
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > asset.size) throw new Error("Hosted artifact exceeds its declared size");
      digest.update(value);
      if (!binary) chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const sha256 = digest.digest("hex");
  if (size !== asset.size || asset.digest !== `sha256:${sha256}`) throw new Error("Hosted artifact digest or size differs");
  return { size, sha256, ...(binary ? {} : { bytes: Buffer.concat(chunks) }) };
}

/** Resolve the internal archive from its immutable delivery, never from producer source. */
export async function readNetworkDistribution(version, workspace = root, api = githubReader(workspace)) {
  if (!/^\d{4}\.(?:[1-9]|1[0-2])\.\d+$/.test(version)) throw new Error("Network requires the suffix-free rapid stream");
  const repository = "SlamTheDragon/vrc-packages";
  const tag = `vrcp-network/v${version}`;
  const archiveURL = networkArchiveURL(version);
  const base = `/repos/${repository}`;
  const release = await api(`${base}/releases/tags/${encodeURIComponent(tag)}`);
  if (release.tag_name !== tag || release.draft || release.prerelease !== true || !Number.isSafeInteger(release.id)) {
    throw new Error("Network delivery is not an immutable rapid-stream release");
  }
  const tagAPI = (_method, path) => api(path);
  const initialTag = await api(`${base}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (!/^[a-f0-9]{40}$/.test(initialTag?.object?.sha ?? "")) throw new Error("Invalid network tag object");
  const listing = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  const archive = `vrc-packages-network-${version}.tgz`;
  const expected = new Set([archive, `${archive}.json`, "CHANGELOG.md", "CHECKSUMS.sha256"]);
  if (!Array.isArray(listing) || listing.length !== expected.size) throw new Error("Unexpected network release assets");
  const files = new Map();
  let size = 0;
  for (const asset of listing) {
    if (!expected.delete(asset.name) || asset.browser_download_url !== archiveURL.replace(archive, asset.name)) {
      throw new Error("Network release has an unexpected asset or download origin");
    }
    size += asset.size;
    if (size > 256 * 1024 ** 2) throw new Error("Network assets exceed the buffered download budget");
    const downloaded = await readHostedAsset(asset);
    files.set(asset.name, downloaded.bytes);
  }
  const receipt = JSON.parse(files.get(`${archive}.json`));
  // GitHub can report a branch name as target_commitish. Bind the tag to the checked receipt's SHA instead.
  if (/^[a-f0-9]{40}$/.test(release.target_commitish ?? "") && release.target_commitish !== receipt.commit) {
    throw new Error("Network release target differs from its receipt");
  }
  const { tagObject, commit } = await checkRemoteTag(tagAPI, repository, tag, receipt.commit, initialTag.object.sha);
  checkedAssetBytes(new Map([[archive, files.get(archive)], [`${archive}.json`, files.get(`${archive}.json`)]]),
    { product: "network", channel: "preview", version }, commit, { name: "vrc-packages-network" });
  const notes = files.get("CHANGELOG.md").toString("utf8");
  const link = /\[Checked CI run\]\(([^)]+)\)/.exec(notes)?.[1];
  if (!link || !notes.startsWith(`# VRC Packages - network ${version}\n`) ||
      !notes.includes(`Commit: ${receipt.commit}.\n`) || !notes.includes("Channel: preview.")) {
    throw new Error("Network notes identify another source");
  }
  const runId = sourceRunID(link, repository);
  const run = await api(`${base}/actions/runs/${runId}`);
  const jobs = await api(`${base}/actions/runs/${runId}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count >= 100 || run.head_sha !== receipt.commit ||
      run.status !== "completed" || run.conclusion !== "success") {
    throw new Error("Network CI source or jobs differ from its receipt");
  }
  checkSourceRun(run, jobs.jobs, tag, repository, "network");
  const covered = new Set();
  for (const line of files.get("CHECKSUMS.sha256").toString("utf8").trimEnd().split("\n")) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || match[2] === "CHECKSUMS.sha256" || covered.has(match[2]) || !files.has(match[2]) ||
        createHash("sha256").update(files.get(match[2])).digest("hex") !== match[1]) {
      throw new Error("Network checksum coverage differs from its assets");
    }
    covered.add(match[2]);
  }
  if (covered.size !== files.size - 1) throw new Error("Network checksum coverage is incomplete");
  await checkRemoteTag(tagAPI, repository, tag, receipt.commit, tagObject);
  return { bytes: files.get(archive), receipt, url: archiveURL, tag, tagObject, sourceRun: runId };
}

export async function inspectDelivery(tag, check = false, workspace = root, api = githubReader(workspace)) {
  const git = runGit;
  const selected = sourceTag(tag, workspace);
  if (!Object.hasOwn(workflows, selected.product)) throw new Error("Product delivery remains disabled");
  const repository = repositoryFromRemote(git(workspace, "remote", "get-url", "origin"));
  const base = `/repos/${repository}`;
  const tagAPI = (_method, path) => api(path);
  await checkRemoteTag(tagAPI, repository, tag, selected.commit, selected.tagObject);
  const listing = await api(`${base}/actions/workflows/${workflows[selected.product]}.yml/runs?event=push&head_sha=${selected.commit}&per_page=100`);
  if (!Array.isArray(listing.workflow_runs) || listing.workflow_runs.length >= 100) throw new Error("CI run lookup exceeded its bound");
  const runs = listing.workflow_runs.filter(run => run.head_sha === selected.commit && run.head_branch === tag && run.event === "push" &&
    run.path === `.github/workflows/${workflows[selected.product]}.yml`);
  if (runs.length > 1) throw new Error("Multiple runs match this tag. Inspect exact run IDs before proceeding.");
  if (!runs.length) return { ...selected, status: "ci-not-observed", artifactsVerified: false };
  const run = runs[0];
  const jobs = await api(`${base}/actions/runs/${run.id}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count >= 100) throw new Error("CI job lookup exceeded its bound");
  const release = selected.product === "worker" ? null : await api(`${base}/releases/tags/${encodeURIComponent(tag)}`, true);
  const status = summarizeRun(run, jobs.jobs, release, selected.product, selected.channel);
  const result = { ...selected, run: run.id, url: run.html_url, status, artifactsVerified: false,
    jobs: jobs.jobs.map(job => ({ name: job.name, status: job.status, conclusion: job.conclusion })) };
  if (check && selected.product === "worker" &&
      ["preview-deployed-no-release-assets", "release-build-only-no-production-deployment"].includes(status)) {
    if (!jobs.jobs.some(job => job.name === "build" && job.conclusion === "success")) {
      throw new Error("Worker build success is not proved");
    }
    const manifest = JSON.parse(git(workspace, "show", `${selected.commit}:src-worker/package.json`));
    const configBytes = execFileSync("git", ["show", `${selected.commit}:src-worker/wrangler.toml`],
      { cwd: workspace, timeout: 60_000, stdio: "pipe" });
    const configSha256 = createHash("sha256").update(configBytes).digest("hex");
    const proof = await checkWorkerArtifacts(api, base, run, { product: "worker", name: manifest.name,
      version: selected.version, channel: selected.channel, commit: selected.commit, configSha256 });
    await checkRemoteTag(tagAPI, repository, tag, selected.commit, selected.tagObject);
    return { ...result, artifactsVerified: true, ciBundleVerified: true, ...proof };
  }
  if (!check || status !== "released-artifacts-unverified") return result;
  checkSourceRun(run, jobs.jobs, tag, repository, selected.product);
  if (release.prerelease !== (selected.channel === "preview")) throw new Error("Release channel differs from the source config");
  const assets = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  if (!Array.isArray(assets) || !assets.length || assets.length > 10) throw new Error("Unexpected release asset count");
  const files = new Map(), digests = new Map(), binaryDigests = new Map();
  let totalSize = 0, bufferedSize = 0;
  for (const asset of assets) {
    if (digests.has(asset.name)) throw new Error("Duplicate hosted asset name");
    const url = new URL(asset.browser_download_url);
    if (url.origin !== "https://github.com" || !url.pathname.startsWith(`/${repository}/releases/download/`)) {
      throw new Error("Unexpected public artifact URL");
    }
    const binary = ["crawler", "crawler-client"].includes(selected.product) && allowedBinary(asset.name, selected.product, selected.version);
    if (!Number.isSafeInteger(asset.size) || asset.size < 1) throw new Error("Invalid hosted artifact size");
    totalSize += asset.size;
    if (!binary) bufferedSize += asset.size;
    if (totalSize > 4 * 1024 ** 3 || bufferedSize > 256 * 1024 ** 2) throw new Error("Hosted artifacts exceed the bounded readback budget");
    const { bytes, size, sha256 } = await readHostedAsset(asset, binary);
    digests.set(asset.name, sha256);
    if (binary) binaryDigests.set(asset.name, { size, sha256 });
    else files.set(asset.name, bytes);
  }
  const notes = files.get("CHANGELOG.md")?.toString("utf8");
  if (!notes || !notes.includes(`Commit: ${selected.commit}.`) || !sameSourceRunLink(notes, run.html_url, repository)) {
    throw new Error("Hosted changelog differs from its source run");
  }
  const checksums = files.get("CHECKSUMS.sha256")?.toString("utf8").trim().split("\n");
  if (!checksums || checksums.length !== digests.size - 1) throw new Error("Hosted checksum list is incomplete");
  const seen = new Set();
  for (const line of checksums) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || seen.has(match[2]) || !digests.has(match[2]) || match[2] === "CHECKSUMS.sha256" || digests.get(match[2]) !== match[1]) {
      throw new Error("Hosted checksum entry differs from its artifact");
    }
    seen.add(match[2]);
  }
  const manifest = JSON.parse(git(workspace, "show", `${selected.commit}:${productDirectories[selected.product]}/package.json`));
  checkedAssetBytes(new Map([...files].filter(([name]) => !["CHANGELOG.md", "CHECKSUMS.sha256"].includes(name))), selected, selected.commit, manifest, binaryDigests);
  if (selected.product === "package") {
    const name = sdkPackageNames[selected.channel];
    const metadata = await fetch(`https://registry.npmjs.org/${name}/${selected.version}`, {
      redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!metadata.ok) throw new Error("npm publication is not readable");
    const registry = await metadata.json();
    const integrity = `sha512-${createHash("sha512").update(files.get(`${name}-${selected.version}.tgz`)).digest("base64")}`;
    if (registry.name !== name || registry.version !== selected.version || registry.dist?.integrity !== integrity) {
      throw new Error("npm registry identity or integrity differs from the checked release tarball");
    }
  }
  await checkRemoteTag(tagAPI, repository, tag, selected.commit, selected.tagObject);
  return { ...result, status: "release-artifacts-verified", artifactsVerified: true,
    sha256: Object.fromEntries(digests) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, first, second, ...extra] = process.argv.slice(2);
  try {
    let result;
    if (action === "start" && (!extra.length || extra.length === 1 && extra[0] === "--execute")) {
      result = await startDelivery(first, second, extra[0] === "--execute");
    } else if (["status", "check", "retry"].includes(action) && !second && !extra.length) {
      result = action === "retry" ? retryDelivery(first) : await inspectDelivery(first, action === "check");
    } else throw new Error("Use start <preview|release> <product> [--execute], or status|check|retry <tag>");
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "ci-failed") process.exitCode = 1;
  } catch (error) {
    // Native errors can include credential-helper or authenticated transport details.
    console.error(error instanceof Error && !error.cause ? error.message : "Delivery failed. Inspect the exact tag/run before retrying.");
    process.exitCode = 1;
  }
}
