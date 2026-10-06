import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseSource, readGitHubAPI, selectTag } from "./delivery.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = ".github/delivery-recoveries.json";
const workflow = ".github/workflows/node-docker.yml";
const sha = value => /^[a-f0-9]{40}$/.test(value ?? "");
const git = (workspace, ...args) => execFileSync("git", args, {
  cwd: workspace, encoding: "utf8", timeout: 30_000, stdio: "pipe" });

export function recoveryIdentity(tag, workspace = root) {
  const manifest = JSON.parse(readFileSync(resolve(workspace, manifestPath), "utf8"));
  const identity = Object.hasOwn(manifest.tags ?? {}, tag ?? "") ? manifest.tags[tag] : undefined;
  if (manifest.schemaVersion !== 1 || manifest.repository !== "SlamTheDragon/vrc-packages" ||
      identity?.product !== "crawler" || tag !== `vrcp-crawler/v${identity.version}` ||
      !/^0\.0\.[0-9]+$/.test(identity.version) || !sha(identity.commit) || !sha(identity.tagObject) ||
      !Number.isSafeInteger(identity.failedRun) || identity.failedRun < 1) {
    throw new Error("Recovery requires an exact owner-reviewed crawler identity. No version or tag changes are permitted.");
  }
  return { ...identity, tag, repository: manifest.repository };
}

/** This only selects a candidate. Every caller must also check its remote evidence. */
export function recoveryRunMatches(run, identity) {
  return run?.event === "workflow_dispatch" && run.head_branch === "main" && sha(run.head_sha) &&
    run.head_repository?.full_name === identity.repository && run.path === workflow &&
    run.display_title === `Recover crawler ${identity.tag}` && run.actor?.type === "User" &&
    run.actor.login?.toLowerCase() === identity.repository.split("/")[0].toLowerCase();
}

export async function checkRecoveryRun(run, identity, api = readGitHubAPI()) {
  if (!recoveryRunMatches(run, identity)) throw new Error("Recovery must originate from the owner on reviewed main.");
  const base = `/repos/${identity.repository}`;
  const ancestry = await api(`${base}/compare/${run.head_sha}...main`);
  if (!["ahead", "identical"].includes(ancestry.status) || ancestry.base_commit?.sha !== run.head_sha ||
      ancestry.merge_base_commit?.sha !== run.head_sha) throw new Error("Recovery tooling is not reachable from main.");
  const file = await api(`${base}/contents/${manifestPath}?ref=${run.head_sha}`);
  if (file.type !== "file" || file.path !== manifestPath || file.encoding !== "base64" ||
      typeof file.content !== "string" || file.content.length > 32_768) throw new Error("Missing reviewed recovery authorization.");
  const authorized = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  if (authorized.schemaVersion !== 1 || authorized.repository !== identity.repository ||
      JSON.stringify(authorized.tags?.[identity.tag]) !== JSON.stringify(Object.fromEntries(
        Object.entries(identity).filter(([key]) => !["tag", "repository"].includes(key))))) {
    throw new Error("Recovery authorization differs from the exact failed identity.");
  }
  const failed = await api(`${base}/actions/runs/${identity.failedRun}`);
  const jobs = await api(`${base}/actions/runs/${identity.failedRun}/jobs?per_page=100`);
  const artifacts = await api(`${base}/actions/runs/${identity.failedRun}/artifacts?per_page=100`);
  if (failed.event !== "push" || failed.head_branch !== identity.tag || failed.head_sha !== identity.commit ||
      failed.path !== workflow || failed.head_repository?.full_name !== identity.repository ||
      failed.status !== "completed" || failed.conclusion !== "failure" ||
      !Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.total_count >= 100 ||
      !jobs.jobs.some(job => job.name === "route" && job.conclusion === "failure") ||
      jobs.jobs.some(job => job.name !== "route" && job.conclusion !== "skipped") ||
      artifacts.total_count !== 0 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== 0) {
    throw new Error("Recovery is limited to a failed route with no build, publication or artifact output.");
  }
  return { ...identity, toolingCommit: run.head_sha, recoveryRun: run.id };
}

export function ciSourceCommit(env = process.env, workspace = root) {
  return env.VRCP_RECOVERY_TAG ? recoveryIdentity(env.VRCP_RECOVERY_TAG, workspace).commit : env.GITHUB_SHA;
}

export function checkRecoveryReceipts(files, proof) {
  for (const name of ["crawler-linux.receipt.json", "crawler-windows.receipt.json"]) {
    const bytes = files.get(name);
    if (!bytes) throw new Error("Recovery binary receipt is missing.");
    const receipt = JSON.parse(bytes.toString("utf8"));
    const recovery = receipt.recovery;
    if (receipt.commit !== proof.commit || !recovery || Object.keys(recovery).length !== 3 ||
        recovery.toolingCommit !== proof.toolingCommit || recovery.sourceRun !== proof.recoveryRun ||
        recovery.failedRun !== proof.failedRun) throw new Error("Recovery receipt differs from checked source, tooling or run identity.");
  }
}

export async function requireRecoveryCI(product, channel, env, workspace, api, readGit = git) {
  const identity = recoveryIdentity(env.VRCP_RECOVERY_TAG, workspace);
  if (product !== "crawler" || channel !== "release" || env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_REPOSITORY !== identity.repository || !sha(env.GITHUB_SHA) || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Recovery execution requires the dedicated owner-dispatched main workflow.");
  }
  const run = await api(`/repos/${identity.repository}/actions/runs/${env.GITHUB_RUN_ID}`);
  if (String(run.id) !== env.GITHUB_RUN_ID || run.head_sha !== env.GITHUB_SHA) throw new Error("Recovery run identity differs.");
  const proof = await checkRecoveryRun(run, identity, api);
  if (readGit(workspace, "rev-parse", "HEAD").trim() !== identity.commit ||
      readGit(workspace, "diff", identity.commit, "--", "src-crawler", "config.versions.json", "config.preview.versions.json").trim()) {
    throw new Error("Recovery product source or saved version configs differ from the immutable tag.");
  }
  await checkReleaseSource({ product, channel, version: identity.version }, identity, api, readGit, workspace);
  return proof;
}

/** Explicit dispatch only. No automatic rerun, tag update, version bump or local release artifact. */
export async function recoverDelivery(tag, execute = false, workspace = root, api = readGitHubAPI(), dispatch = dispatchRecovery) {
  const identity = recoveryIdentity(tag, workspace);
  const configs = Object.fromEntries(["release", "preview"].map(channel => [channel, JSON.parse(git(workspace,
    "show", `${identity.commit}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`))]));
  const selected = selectTag(tag, configs);
  await checkReleaseSource(selected, identity, api, git, workspace);
  const toolingCommit = git(workspace, "rev-parse", "HEAD").trim();
  let promoted = false;
  try { git(workspace, "merge-base", "--is-ancestor", toolingCommit, "origin/main"); promoted = true; }
  catch { /* An unpublished local commit cannot supply reviewed recovery tooling. */ }
  if (!promoted) {
    if (execute) throw new Error("Recovery tooling must be owner-promoted to main before dispatch. No remote write ran.");
    return { ...identity, toolingCommit, status: "tooling-promotion-required", readOnly: true,
      next: "Push the checked test branch, obtain owner review and merge, then synchronize main and repeat the root recovery command." };
  }
  const run = { event: "workflow_dispatch", head_branch: "main", head_sha: toolingCommit,
    head_repository: { full_name: identity.repository }, path: workflow,
    display_title: `Recover crawler ${tag}`, actor: { login: identity.repository.split("/")[0], type: "User" } };
  await checkRecoveryRun(run, identity, api);
  const listing = await api(`/repos/${identity.repository}/actions/workflows/node-docker.yml/runs?event=workflow_dispatch&per_page=100`);
  if (!Array.isArray(listing.workflow_runs) || listing.workflow_runs.length >= 100) throw new Error("Recovery listing exceeds its bound.");
  const attempts = listing.workflow_runs.filter(candidate => recoveryRunMatches(candidate, identity));
  if (attempts.length) return { ...identity, toolingCommit, status: "existing-recovery-attempt", readOnly: true,
    attempts: attempts.map(attempt => ({ run: attempt.id, status: attempt.status, conclusion: attempt.conclusion, url: attempt.html_url })),
    next: "Inspect this exact attempt. CI retries and ambiguous partial publication require manual resolution." };
  const releases = await api(`/repos/${identity.repository}/releases?per_page=100`);
  if (!Array.isArray(releases) || releases.length >= 100 || releases.some(release => release.tag_name === tag)) {
    throw new Error("Recovery cannot rebuild a version with an existing Release or incomplete publication evidence.");
  }
  const plan = { ...identity, toolingCommit, status: "recovery-plan", readOnly: true, ref: "main", workflow: "node-docker.yml" };
  if (!execute) return plan;
  if (git(workspace, "symbolic-ref", "--short", "HEAD").trim() !== "main" || git(workspace, "status", "--porcelain").trim() ||
      git(workspace, "ls-remote", "origin", "refs/heads/main").trim().split(/\s+/)[0] !== toolingCommit) {
    throw new Error("Recovery dispatch requires clean synchronized main after owner review and merge.");
  }
  await dispatch(identity.repository, tag);
  return { ...plan, status: "recovery-dispatched", readOnly: false,
    next: "Inspect the owner-dispatched crawler workflow, approve its release environment, then run delivery:check for this unchanged tag." };
}

async function dispatchRecovery(repository, tag) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Recovery dispatch needs an explicit GitHub credential with repository Actions write permission.");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/node-docker.yml/dispatches`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { "recovery-tag": tag } }) });
  await response.body?.cancel();
  if (response.status !== 204) throw new Error(`Recovery dispatch failed (HTTP ${response.status}). Check Actions write scope. No automatic retry ran.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
  const [tag, flag, ...extra] = process.argv.slice(2);
  try {
    if (!tag || extra.length || flag && flag !== "--execute") throw new Error("Use delivery:recover <exact-tag> [--execute].");
    const result = await recoverDelivery(tag, flag === "--execute");
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "tooling-promotion-required") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  })();
}
