import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpVersion, nextVersion, productDirectories, productTagPrefixes, readVersionConfig, sdkPackageNames } from "./versioning.mjs";
import { checkSDKPublicationVersion, selectTag } from "./delivery.mjs";
import { checkedAssetBytes, checkSourceRun, checkRemoteTag, sameSourceRunLink } from "./release-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflows = { package: "vrc-packages-api", network: "network", crawler: "node-docker",
  "crawler-client": "node-client", worker: "cloudflare-worker" };
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

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
  if (git(workspace, "status", "--porcelain")) blockers.push("Worktree or index is dirty");
  if (git(workspace, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`)) blockers.push("Local tag already exists");
  const refs = git(workspace, "ls-remote", "origin", `refs/heads/${branch}`, `refs/tags/${tag}`).split("\n");
  const head = git(workspace, "rev-parse", "HEAD");
  if (!refs.includes(`${head}\trefs/heads/${branch}`)) blockers.push("Origin branch differs from HEAD or does not exist");
  if (refs.some(line => line.endsWith(`\trefs/tags/${tag}`))) blockers.push("Remote tag already exists");
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
  git(workspace, "add", "--", plan.configPath);
  git(workspace, "commit", "--only", "-m", `Deliver ${product} ${channel} ${plan.version}`, "--", plan.configPath);
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
    // Atomic normal pushes fail on divergence and existing tags. Never replace a tag.
    git(workspace, "push", "--atomic", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`);
  }
  return { ...selected, repository, status: remote ? "already-pushed" : "pushed",
    next: [`npm run delivery:status -- ${tag}`, `npm run delivery:check -- ${tag}`] };
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
  return async (path, missing = false) => {
    const response = await fetch(`https://api.github.com${path}`, { redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/vnd.github+json", "user-agent": "VRCPDelivery", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub metadata request failed (${response.status}). No mutation ran.`);
    return response.json();
  };
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
  if (!check || status !== "released-artifacts-unverified") return result;
  checkSourceRun(run, jobs.jobs, tag, repository, selected.product);
  if (release.prerelease !== (selected.channel === "preview")) throw new Error("Release channel differs from the source config");
  const assets = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  if (!Array.isArray(assets) || !assets.length || assets.length > 10) throw new Error("Unexpected release asset count");
  const files = new Map();
  let totalSize = 0;
  for (const asset of assets) {
    if (files.has(asset.name)) throw new Error("Duplicate hosted asset name");
    const url = new URL(asset.browser_download_url);
    if (url.origin !== "https://github.com" || !url.pathname.startsWith(`/${repository}/releases/download/`)) {
      throw new Error("Unexpected public artifact URL");
    }
    totalSize += asset.size;
    if (totalSize > 256 * 1024 * 1024) throw new Error("Hosted artifacts exceed the memory-check budget");
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 256 * 1024 * 1024) {
      await response.body?.cancel();
      throw new Error("Hosted artifact is missing or oversized");
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > asset.size) throw new Error("Hosted artifact exceeds its declared size");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    if (size !== asset.size || asset.digest !== `sha256:${sha256(bytes)}`) throw new Error("Hosted artifact digest or size differs");
    files.set(asset.name, bytes);
  }
  const notes = files.get("CHANGELOG.md")?.toString("utf8");
  if (!notes || !notes.includes(`Commit: ${selected.commit}.`) || !sameSourceRunLink(notes, run.html_url, repository)) {
    throw new Error("Hosted changelog differs from its source run");
  }
  const checksums = files.get("CHECKSUMS.sha256")?.toString("utf8").trim().split("\n");
  if (!checksums || checksums.length !== files.size - 1) throw new Error("Hosted checksum list is incomplete");
  const seen = new Set();
  for (const line of checksums) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || seen.has(match[2]) || !files.has(match[2]) || match[2] === "CHECKSUMS.sha256" || sha256(files.get(match[2])) !== match[1]) {
      throw new Error("Hosted checksum entry differs from its artifact");
    }
    seen.add(match[2]);
  }
  const manifest = JSON.parse(git(workspace, "show", `${selected.commit}:${productDirectories[selected.product]}/package.json`));
  checkedAssetBytes(new Map([...files].filter(([name]) => !["CHANGELOG.md", "CHECKSUMS.sha256"].includes(name))), selected, selected.commit, manifest);
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
    sha256: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])) };
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
