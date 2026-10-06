import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { bumpVersion, networkArchiveURL, nextVersion, productDirectories, productTagPrefixes, readVersionConfig, sdkPackageNames, versionFiles } from "./versioning.mjs";
import { checkReleaseMetadata, checkReviewedRelease, checkSDKPublicationVersion, readGitHubAPI, readReleaseTagProof, selectTag } from "./delivery.mjs";
import { allowedBinary, checkedAssetBytes, checkSourceRun, checkRemoteTag, sameSourceRunLink, sourceRunID } from "./release-assets.mjs";
import { checkWorkerArtifacts, downloadActionsArchive } from "./worker-artifacts.mjs";
import { checkRecoveryReceipts, checkRecoveryRun, recoveryIdentity } from "./delivery-recovery.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflows = { package: "vrc-packages-api", network: "network", crawler: "node-docker",
  "crawler-client": "node-client", worker: "cloudflare-worker" };

function runGit(workspace, ...args) {
  try {
    const output = execFileSync("git", args, { cwd: workspace, encoding: "utf8", timeout: 60_000,
      stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" } });
    return args.includes("-z") ? output : output.trim();
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

function mainVersionBlocker(channel, product, version, refs, workspace, git) {
  const main = refs.find(line => line.endsWith("\trefs/heads/main"))?.split("\t")[0];
  if (!/^[a-f0-9]{40}$/.test(main ?? "")) return "Origin main is unavailable";
  try {
    const mainConfig = JSON.parse(git(workspace, "show", `${main}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`));
    const mainVersion = mainConfig[`${channel}-${product}`];
    if (semver.valid(mainVersion) !== mainVersion) throw new Error("Invalid main version");
    if (semver.lt(version, mainVersion)) return "Version config is behind origin main; synchronize before bumping";
  } catch { return "Cannot read current origin main version config; fetch origin main before delivery"; }
}

/** Read-only planning. Release execution prepares a version PR, not a direct main push. */
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
  const releaseBranch = channel === "release" ? `codex/release/${product}/v${version}` : undefined;
  const blockers = [];
  if (channel === "release" && branch !== "main") blockers.push("Release delivery requires main after reviewed promotion");
  if (git(workspace, "status", "--porcelain")) blockers.push("Worktree or index is dirty");
  if (git(workspace, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`)) blockers.push("Local tag already exists");
  if (releaseBranch && git(workspace, "for-each-ref", "--format=%(refname)", `refs/heads/${releaseBranch}`)) {
    blockers.push("Release preparation branch already exists; inspect it instead of allocating again");
  }
  const refs = git(workspace, "ls-remote", "origin", `refs/heads/${branch}`, "refs/heads/main",
    ...(releaseBranch ? [`refs/heads/${releaseBranch}`] : []), `refs/tags/${productTagPrefixes[product]}/v*`).split("\n");
  const head = git(workspace, "rev-parse", "HEAD");
  if (!refs.includes(`${head}\trefs/heads/${branch}`)) blockers.push("Origin branch differs from HEAD or does not exist");
  if (refs.some(line => line.endsWith(`\trefs/tags/${tag}`))) blockers.push("Remote tag already exists");
  if (releaseBranch && refs.some(line => line.endsWith(`\trefs/heads/${releaseBranch}`))) {
    blockers.push("Remote release preparation branch exists; review or recover it instead of allocating again");
  }
  if (newerRemoteVersion(channel, product, previous, refs)) blockers.push("Version config is behind a remote delivery tag; synchronize before bumping");
  const mainBlocker = mainVersionBlocker(channel, product, previous, refs, workspace, git);
  if (mainBlocker) blockers.push(mainBlocker);
  const other = (await readVersionConfig(channel === "preview" ? "release" : "preview", workspace)).config;
  if (other[`${channel === "preview" ? "release" : "preview"}-${product}`] === version) blockers.push("Channel tag would be ambiguous");
  return { channel, product, previous, version, tag, branch, repository, head, configPath, blockers, ...(releaseBranch ? { releaseBranch } : {}),
    workflow: `${workflows[product]}.yml`, purpose: "plan-only",
    delivery: channel === "release" ? "version-pr-then-reviewed-main-tag" : "tagged-delivery",
    ...(product === "worker" && channel === "release" ? { publication: "ci-build-only-no-production-deployment" } : {}) };
}

function pendingPaths(status) {
  if (!status) return [];
  if (!status.endsWith("\0")) throw new Error("Pending status must use NUL-terminated paths");
  const records = status.slice(0, -1).split("\0"), paths = new Set();
  for (let index = 0; index < records.length; index++) {
    const record = records[index], code = record.slice(0, 2);
    if (!/^[ MADRCUT?]{2} /.test(record) || record.length < 4) throw new Error("Malformed pending status");
    if (["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(code)) {
      throw new Error("Resolve unmerged files before a pending preview checkpoint");
    }
    paths.add(record.slice(3));
    if (/[RC]/.test(code)) {
      const original = records[++index];
      if (!original) throw new Error("Rename status is missing its original path");
      paths.add(original);
    }
  }
  return [...paths].sort();
}

function rejectIgnoredPending(paths, workspace, git) {
  const ignored = new Set(git(workspace, "ls-files", "--cached", "--ignored", "--exclude-standard", "-z").split("\0"));
  const selected = paths.filter(path => ignored.has(path));
  if (selected.length) throw new Error(`Indexed ignored pending files cannot be checkpointed: ${JSON.stringify(selected)}`);
}

/** Checkpoint the owner's selected nonignored pending files before allocating a preview version. */
function checkpointPendingPreview(plan, workspace, git) {
  const args = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
  const status = git(workspace, ...args), paths = pendingPaths(status);
  if (!paths.length) return;
  if (paths.some(path => ["config.versions.json", "config.preview.versions.json"].includes(path))) {
    throw new Error("Pending version-config edits cannot be checkpointed. Use the authoritative root allocator; no staging, commit or bump ran.");
  }
  rejectIgnoredPending(paths, workspace, git);
  console.log(JSON.stringify({ pendingFiles: paths }));
  if (git(workspace, "rev-parse", "HEAD") !== plan.head ||
      git(workspace, "symbolic-ref", "--short", "HEAD") !== plan.branch || git(workspace, ...args) !== status) {
    throw new Error("Repository changed before the pending preview checkpoint");
  }
  git(workspace, "add", "--all");
  const stagedPaths = pendingPaths(git(workspace, ...args));
  rejectIgnoredPending(stagedPaths, workspace, git);
  if (JSON.stringify(stagedPaths) !== JSON.stringify(paths)) {
    throw new Error("Pending paths changed during staging. Staging is retained for inspection; no commit or version bump ran.");
  }
  git(workspace, "commit", "-m", `Checkpoint pending changes before ${plan.product} preview ${plan.version}`);
  const commit = git(workspace, "rev-parse", "HEAD");
  if (git(workspace, "symbolic-ref", "--short", "HEAD") !== plan.branch) {
    throw new Error("Branch changed during pending checkpoint. Inspect the retained commit; no version bump ran.");
  }
  try { git(workspace, "push", "--no-follow-tags", "origin", `HEAD:refs/heads/${plan.branch}`); }
  catch {
    throw new Error(`Pending preview checkpoint ${commit} is retained on ${JSON.stringify(plan.branch)}. Recover on that same branch with git push --no-follow-tags origin ${JSON.stringify(`HEAD:refs/heads/${plan.branch}`)} before rerunning preview delivery. No version bump ran.`);
  }
  return { branch: plan.branch, commit, paths, status: "pushed" };
}

/** Keep failed local commit/tag state so an exact retry cannot allocate another version. */
export async function startDelivery(channel, product, execute = false, workspace = root, now = new Date(), git = runGit,
    publicationProof = inspectDelivery) {
  let plan = await planDelivery(channel, product, workspace, now, git);
  if (!execute) return plan;
  const blockers = plan.blockers.filter(blocker => channel !== "preview" || blocker !== "Worktree or index is dirty");
  if (blockers.length) throw new Error(`Delivery blocked: ${blockers.join("; ")}`);
  await requirePublicationProof(channel, product, plan.previous, workspace, publicationProof);
  if (git(workspace, "rev-parse", "HEAD") !== plan.head || git(workspace, "symbolic-ref", "--short", "HEAD") !== plan.branch) {
    throw new Error("Repository changed after planning");
  }
  const pendingCheckpoint = channel === "preview" ? checkpointPendingPreview(plan, workspace, git) : undefined;
  if (pendingCheckpoint) {
    plan = await planDelivery(channel, product, workspace, now, git);
    if (plan.blockers.length) throw new Error(`Pending checkpoint pushed; delivery blocked: ${plan.blockers.join("; ")}. No version bump ran.`);
  }
  // Recheck immediately before writes. A later race still cannot force an origin ref.
  if (git(workspace, "status", "--porcelain") || git(workspace, "rev-parse", "HEAD") !== plan.head ||
      git(workspace, "symbolic-ref", "--short", "HEAD") !== plan.branch) {
    throw new Error("Repository changed after planning");
  }
  if (channel === "release") git(workspace, "checkout", "-b", plan.releaseBranch);
  const result = await bumpVersion(channel, product, "patch", workspace, now);
  if (result.version !== plan.version) throw new Error("Config changed after planning. Inspect it before retrying.");
  const metadata = await versionFiles("sync", channel, product, workspace);
  const paths = [plan.configPath, ...metadata.changed];
  git(workspace, "add", "--", ...paths);
  git(workspace, "commit", "--only", "-m", `${channel === "release" ? "Prepare" : "Deliver"} ${product} ${channel} ${plan.version}`,
    ...(channel === "release" ? ["-m", `VRCP-Release-Product: ${product}\nVRCP-Release-Version: ${plan.version}\nVRCP-Release-Base: ${plan.head}`] : []), "--", ...paths);
  if (channel === "release") return retryReleasePreparation(plan.releaseBranch, workspace, git);
  git(workspace, "tag", "-a", plan.tag, "-m", `VRC Packages ${product} ${channel} ${plan.version}`);
  return { ...retryDelivery(plan.tag, workspace, git), ...(pendingCheckpoint ? { pendingCheckpoint } : {}) };
}

/** Preparation pushes only its version PR branch. It never writes main or a delivery tag. */
export async function retryReleasePreparation(branch, workspace = root, git = runGit) {
  const match = /^codex\/release\/(package|crawler|crawler-client|worker)\/v([0-9][0-9A-Za-z.+-]*)$/.exec(branch ?? "");
  if (!match || semver.valid(match[2]) !== match[2] || semver.prerelease(match[2])) throw new Error("Expected an exact release preparation branch");
  if (git(workspace, "symbolic-ref", "--short", "HEAD") !== branch || git(workspace, "status", "--porcelain")) {
    throw new Error("Release preparation retry requires its clean local branch");
  }
  const commit = git(workspace, "rev-parse", "HEAD"), repository = repositoryFromRemote(git(workspace, "remote", "get-url", "origin"));
  const message = git(workspace, "log", "-1", "--format=%B");
  const trailers = key => {
    const values = message.split(/\r?\n/).filter(line => line.startsWith(`${key}:`));
    if (values.length !== 1 || !values[0].startsWith(`${key}: `)) throw new Error("Release preparation commit has missing or duplicate identity trailers");
    return values[0].slice(key.length + 2);
  };
  const base = trailers("VRCP-Release-Base");
  if (!/^[a-f0-9]{40}$/.test(base) || git(workspace, "rev-parse", "HEAD^") !== base ||
      trailers("VRCP-Release-Product") !== match[1] || trailers("VRCP-Release-Version") !== match[2]) {
    throw new Error("Release preparation commit differs from its branch or base");
  }
  const config = JSON.parse(git(workspace, "show", `${commit}:config.versions.json`));
  if (config[`release-${match[1]}`] !== match[2]) throw new Error("Preparation config differs from its branch");
  await checkReleaseMetadata({ channel: "release", product: match[1], version: match[2] }, { base, head: commit }, workspace, git);
  const refs = git(workspace, "ls-remote", "origin", "refs/heads/main", `refs/heads/${branch}`).split("\n");
  const remote = refs.find(line => line.endsWith(`\trefs/heads/${branch}`));
  if (remote && remote !== `${commit}\trefs/heads/${branch}`) throw new Error("Remote preparation branch differs; never overwrite it automatically");
  if (!remote) {
    if (!refs.includes(`${base}\trefs/heads/main`)) throw new Error("Main changed before release preparation push; inspect retained metadata before retrying");
    git(workspace, "push", "--no-follow-tags", "origin", `HEAD:refs/heads/${branch}`);
  }
  const tag = `${productTagPrefixes[match[1]]}/v${match[2]}`;
  return { channel: "release", product: match[1], version: match[2], repository, base, commit, branch, tag,
    status: remote ? "preparation-already-pushed-awaiting-review" : "preparation-pushed-awaiting-review",
    pullRequestURL: `https://github.com/${repository}/compare/main...${encodeURIComponent(branch)}?expand=1`,
    next: ["Create and manually review a version promotion PR into main. Do not merge an evergreen tracking PR.",
      `bun run delivery:finalize ${match[1]} <merged-pr-number> <merged-main-commit> --execute`] };
}

function releaseTagProof(tag, workspace, git) {
  if (git(workspace, "cat-file", "-t", `refs/tags/${tag}`) !== "tag") throw new Error("Release requires an annotated proof tag");
  return readReleaseTagProof(git(workspace, "cat-file", "-p", `refs/tags/${tag}`),
    { tag, commit: git(workspace, "rev-parse", `refs/tags/${tag}^{commit}`) });
}

/** Read-only proof or tag-only push. Never bump again, push main, merge a PR or approve a release. */
export async function finalizeRelease(product, prNumber, commit, execute = false, workspace = root, git = runGit, api = readGitHubAPI(),
    publicationProof = inspectDelivery) {
  if (!["package", "crawler", "crawler-client", "worker"].includes(product) || !Number.isSafeInteger(prNumber) ||
      prNumber < 1 || !/^[a-f0-9]{40}$/.test(commit ?? "")) throw new Error("Use finalize <product> <merged-pr-number> <merged-main-commit> [--execute]");
  if (git(workspace, "symbolic-ref", "--short", "HEAD") !== "main" || git(workspace, "status", "--porcelain")) {
    throw new Error("Release finalization requires clean main after owner-reviewed promotion");
  }
  const repository = repositoryFromRemote(git(workspace, "remote", "get-url", "origin"));
  const main = git(workspace, "rev-parse", "HEAD");
  const configs = Object.fromEntries(["release", "preview"].map(channel => [channel,
    JSON.parse(git(workspace, "show", `${commit}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`))]));
  const version = configs.release[`release-${product}`], tag = `${productTagPrefixes[product]}/v${version}`;
  const selected = selectTag(tag, configs);
  if (selected.product !== product || selected.channel !== "release") throw new Error("Merged source selects another release");
  const refs = git(workspace, "ls-remote", "origin", "refs/heads/main", `refs/tags/${productTagPrefixes[product]}/v*`).split("\n");
  if (!refs.includes(`${main}\trefs/heads/main`)) throw new Error("Origin main differs from the clean local checkout");
  git(workspace, "merge-base", "--is-ancestor", commit, main);
  if (newerRemoteVersion("release", product, version, refs)) throw new Error("A newer release tag exists; do not publish older source");
  const mainBlocker = mainVersionBlocker("release", product, version, refs, workspace, git);
  if (mainBlocker) throw new Error(`Release finalization blocked: ${mainBlocker}`);
  const pr = await api(`/repos/${repository}/pulls/${prNumber}`);
  if (!/^[a-f0-9]{40}$/.test(pr?.head?.sha ?? "")) throw new Error("Invalid release preparation head evidence");
  const proof = await checkReviewedRelease(selected, { repository, commit, tag, prNumber, head: pr?.head?.sha,
    base: git(workspace, "rev-parse", `${pr?.head?.sha}^`) }, api);
  const metadata = await checkReleaseMetadata(selected, proof, workspace, git);
  const local = git(workspace, "for-each-ref", "--format=%(refname)", `refs/tags/${tag}`);
  let tagObject;
  if (local) {
    if (git(workspace, "rev-parse", `refs/tags/${tag}^{commit}`) !== commit) throw new Error("Local release tag identifies another commit");
    const retained = releaseTagProof(tag, workspace, git);
    if (retained.prNumber !== prNumber || retained.head !== proof.head || retained.base !== proof.base) throw new Error("Local release tag identifies another review");
    tagObject = git(workspace, "rev-parse", `refs/tags/${tag}`);
  }
  const remote = refs.find(line => line.endsWith(`\trefs/tags/${tag}`));
  if (remote && (!tagObject || remote !== `${tagObject}\trefs/tags/${tag}`)) throw new Error("Remote release tag differs; never replace it automatically");
  const result = { ...selected, repository, tag, commit, prNumber, head: proof.head, base: proof.base, changed: metadata.changed,
    status: remote ? "already-pushed" : execute ? "pushed" : "finalization-plan-only", next: [`bun run delivery:status ${tag}`, `bun run delivery:check ${tag}`] };
  if (!execute || remote) return { ...result, ...(tagObject ? { tagObject } : {}) };
  const previous = JSON.parse(git(workspace, "show", `${proof.base}:config.versions.json`))[`release-${product}`];
  await requirePublicationProof("release", product, previous, workspace, publicationProof);
  if (git(workspace, "status", "--porcelain") || git(workspace, "rev-parse", "HEAD") !== main ||
      !git(workspace, "ls-remote", "origin", "refs/heads/main").split("\n").includes(`${main}\trefs/heads/main`)) {
    throw new Error("Main changed after release proof; no tag push ran");
  }
  if (!local) git(workspace, "tag", "-a", tag, commit, "-m", `VRC Packages ${product} release ${version}\n\nVRCP-Release-PR: ${prNumber}\nVRCP-Release-Head: ${proof.head}\nVRCP-Release-Base: ${proof.base}`);
  tagObject = git(workspace, "rev-parse", `refs/tags/${tag}`);
  git(workspace, "push", "--no-follow-tags", "origin", `refs/tags/${tag}`);
  return { ...result, tagObject };
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
    if (selected.channel === "release") {
      const proof = releaseTagProof(tag, workspace, git);
      return finalizeRelease(selected.product, proof.prNumber, selected.commit, true, workspace, git);
    }
    if (git(workspace, "status", "--porcelain") || git(workspace, "rev-parse", "HEAD") !== selected.commit) {
      throw new Error("Retry requires a clean checkout at the tag commit");
    }
    const branch = git(workspace, "symbolic-ref", "--short", "HEAD");
    const versions = git(workspace, "ls-remote", "origin", "refs/heads/main", `refs/tags/${productTagPrefixes[selected.product]}/v*`).split("\n");
    if (newerRemoteVersion(selected.channel, selected.product, selected.version, versions)) {
      throw new Error("Newer remote delivery exists. Inspect the retained local tag; do not replace it or skip a patch.");
    }
    const mainBlocker = mainVersionBlocker(selected.channel, selected.product, selected.version, versions, workspace, git);
    if (mainBlocker) throw new Error(`Retry blocked: ${mainBlocker}`);
    // Atomic normal pushes fail on divergence and existing tags. Never replace a tag.
    git(workspace, "push", "--atomic", "--no-follow-tags", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`);
  }
  return { ...selected, repository, status: remote ? "already-pushed" : "pushed",
    next: [`bun run delivery:status ${tag}`, `bun run delivery:check ${tag}`] };
}

export async function requirePublicationProof(channel, product, version, workspace = root, inspect = inspectDelivery) {
  const tag = `${productTagPrefixes[product]}/v${version}`;
  const current = await inspect(tag, true, workspace);
  if (current.tag !== tag || current.product !== product || current.channel !== channel || current.version !== version) {
    throw new Error("Publication proof differs from the configured product/channel/version; no version or tag write ran");
  }
  const status = product === "worker" ? channel === "preview" ? "preview-deployed-no-release-assets"
    : "release-build-only-no-production-deployment" : "release-artifacts-verified";
  if (current.artifactsVerified !== true || current.status !== status) {
    throw new Error(`Configured delivery ${tag} lacks publication/artifact proof (${current.status}). No version or tag write ran. Use bun run delivery:diagnose ${tag}.`);
  }
  return current;
}

/** Read every enabled configured channel without allocating, publishing or approving anything. */
export async function inspectConfiguredDeliveries(check = false, workspace = root, inspect = inspectDelivery) {
  const results = [];
  for (const channel of ["preview", "release"]) {
    const { config } = await readVersionConfig(channel, workspace);
    for (const product of Object.keys(workflows)) {
      if (channel === "release" && product === "network") continue;
      const version = config[`${channel}-${product}`], tag = `${productTagPrefixes[product]}/v${version}`;
      try {
        const proof = check ? await requirePublicationProof(channel, product, version, workspace, inspect)
          : await inspect(tag, false, workspace);
        results.push({ channel, product, version, tag, status: proof.status, artifactsVerified: proof.artifactsVerified === true,
          ...(proof.url ? { url: proof.url } : {}) });
      } catch {
        results.push({ channel, product, version, tag, status: "proof-unavailable", artifactsVerified: false,
          next: `bun run delivery:diagnose ${tag}` });
      }
    }
  }
  return { readOnly: true, fullProofRequested: check, verified: check && results.every(result => result.artifactsVerified), results };
}

/** Suggest manual actions from observed state, not from an assumed failure cause. */
export function deliveryTroubleshooting(result) {
  const failedJobs = (result.jobs ?? []).filter(job => ["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(job.conclusion))
    .map(job => job.name);
  const next = [`bun run delivery:check ${result.tag}`];
  let stage = "proof-readback";
  if (result.status === "ci-not-observed") { stage = "tag-trigger"; next.unshift(`bun run delivery:retry ${result.tag}`); }
  else if (result.status === "ci-active-or-awaiting-environment") {
    stage = "execution-or-review-pending"; next.unshift("Inspect the existing run and its required operator review. Do not allocate or dispatch another version.");
  } else if (result.status === "awaiting-npm-owner-approval") {
    stage = "npm-staging"; next.unshift("Approve the exact staged npm version, then inspect Release reconciliation.");
  } else if (result.status === "ci-failed") {
    stage = failedJobs.includes("route") ? "routing" : failedJobs.some(name => name.includes("attach")) ? "release-attachment"
      : failedJobs.some(name => name.includes("publish")) ? "publication" : "build-or-runtime-check";
    next.unshift("Inspect the exact failed jobs. CI reruns remain manual. Resolve partial publication before rebuilding.");
    try { recoveryIdentity(result.tag); next.unshift(`bun run delivery:recover ${result.tag}`); }
    catch { /* Unknown failures have no approved rebuild recipe. */ }
  }
  return { readOnly: true, automaticRetry: false, stage, failedJobs, next,
    limits: "Unknown auth, dependency, provenance or partial-publication failures require manual inspection. Never move tags or skip versions." };
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
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
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
  const signal = AbortSignal.timeout(binary ? 1_800_000 : 180_000);
  const chunks = [], digest = createHash("sha256"), rangeSize = 8 * 1024 ** 2;
  const report = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  let size = 0;
  do {
    const start = size, end = Math.min(start + rangeSize, asset.size) - 1;
    if (binary && report) console.error(JSON.stringify({ readbackAsset: String(asset.name).slice(0, 214), bytesRead: size, totalBytes: asset.size }));
    const response = await fetch(asset.browser_download_url, { signal,
      ...(binary ? { headers: { range: `bytes=${start}-${end}`, "accept-encoding": "identity" } } : {}) });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Hosted artifact is unavailable");
    }
    const ranged = response.status === 206;
    if ((ranged && (!binary || response.headers.get("content-range") !== `bytes ${start}-${end}/${asset.size}`)) ||
        (!ranged && (response.status !== 200 || start !== 0))) {
      await response.body.cancel();
      throw new Error("Hosted artifact range differs from the requested bytes");
    }
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > asset.size || (ranged && size > end + 1)) throw new Error("Hosted artifact exceeds its declared size");
        digest.update(value);
        if (!binary) chunks.push(value);
      }
    } finally { await reader.cancel(); }
    if (!ranged) break; // A server can ignore the first range and supply the full file.
    if (size !== end + 1) throw new Error("Hosted artifact range size differs");
  } while (size < asset.size);
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
  const headingMatches = [`# vrc-packages-network ${version}\n`, `# VRC Packages - network ${version}\n`]
    .some(heading => notes.startsWith(heading));
  if (!link || !headingMatches ||
      !notes.includes(`Commit: ${receipt.commit}.\n`) || !notes.includes("Channel: preview.")) {
    throw new Error("Network notes identify another source");
  }
  const runId = sourceRunID(link, repository);
  const run = await api(`${base}/actions/runs/${runId}`);
  const jobs = await api(`${base}/actions/runs/${runId}/jobs?per_page=100`);
  const recovery = run.event === "workflow_dispatch" ? await checkRecoveryRun(run, recoveryIdentity(tag, workspace), api) : null;
  if (recovery) checkRecoveryReceipts(files, recovery);
  if (!Array.isArray(jobs.jobs) || jobs.total_count >= 100 || (recovery?.commit ?? run.head_sha) !== receipt.commit ||
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
  let run = runs[0];
  let jobs = await api(`${base}/actions/runs/${run.id}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count >= 100) throw new Error("CI job lookup exceeded its bound");
  const release = selected.product === "worker" ? null : await api(`${base}/releases/tags/${encodeURIComponent(tag)}`, true);
  const attachedRun = /\[Checked CI run\]\(([^)]+)\)/.exec(release?.body ?? "")?.[1];
  let recoveryProof;
  if (attachedRun && sourceRunID(attachedRun, repository) !== String(run.id)) {
    const recovered = await api(`${base}/actions/runs/${sourceRunID(attachedRun, repository)}`);
    const identity = recoveryIdentity(tag, workspace);
    if (identity.commit !== selected.commit || identity.tagObject !== selected.tagObject) throw new Error("Recovery source differs from the checked tag.");
    recoveryProof = await checkRecoveryRun(recovered, identity, api);
    run = recovered;
    jobs = await api(`${base}/actions/runs/${run.id}/jobs?per_page=100`);
    if (!Array.isArray(jobs.jobs) || jobs.total_count >= 100) throw new Error("Recovery job lookup exceeded its bound.");
  }
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
  if (recoveryProof) checkRecoveryReceipts(files, recoveryProof);
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
    if (["diagnose-configured", "check-configured"].includes(action) && !first && !second && !extra.length) {
      result = await inspectConfiguredDeliveries(action === "check-configured");
      if (action === "check-configured" && !result.verified) process.exitCode = 1;
    } else if (action === "start" && (!extra.length || extra.length === 1 && extra[0] === "--execute")) {
      result = await startDelivery(first, second, extra[0] === "--execute");
    } else if (action === "finalize" && (extra.length === 1 || extra.length === 2 && extra[1] === "--execute") && /^[1-9][0-9]*$/.test(second ?? "")) {
      result = await finalizeRelease(first, Number(second), extra[0], extra[1] === "--execute");
    } else if (action === "retry-preparation" && !second && !extra.length) {
      result = await retryReleasePreparation(first);
    } else if (["status", "check", "diagnose", "retry"].includes(action) && !second && !extra.length) {
      result = action === "retry" ? await retryDelivery(first) : await inspectDelivery(first, action === "check");
      if (action === "diagnose") result = { ...result, ...deliveryTroubleshooting(result) };
    } else throw new Error("Use start <preview|release> <product> [--execute], finalize <product> <pr-number> <merged-main-commit> [--execute], retry-preparation <branch>, or status|check|diagnose|retry <tag>");
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "ci-failed") process.exitCode = 1;
  } catch (error) {
    // Native errors can include credential-helper or authenticated transport details.
    console.error(error instanceof Error && !error.cause ? error.message : "Delivery failed. Inspect the exact tag/run before retrying.");
    process.exitCode = 1;
  }
}
