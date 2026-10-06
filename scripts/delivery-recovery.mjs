import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseSource, readGitHubAPI, selectTag } from "./delivery.mjs";
import { productDirectories, productTagPrefixes } from "./versioning.mjs";
import { checkRemoteTag } from "./release-assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = ".github/delivery-recoveries.json";
const recoveryWorkflows = { crawler: "node-docker", network: "network", "crawler-client": "node-client" };
const workflowFor = identity => `.github/workflows/${recoveryWorkflows[identity.product]}.yml`;
const sha = value => /^[a-f0-9]{40}$/.test(value ?? "");
const git = (workspace, ...args) => execFileSync("git", args, {
  cwd: workspace, encoding: "utf8", timeout: 30_000, stdio: "pipe" });

function dependencyPreparationFailed(jobs) {
  const expected = new Map([["route", "success"], ["build-linux", "failure"],
    ["standalone-windows", "failure"], ["publish-container", "skipped"], ["release-assets", "skipped"]]);
  return jobs.length === expected.size && jobs.every(job => {
    if (expected.get(job.name) !== job.conclusion || !expected.delete(job.name)) return false;
    if (!["build-linux", "standalone-windows"].includes(job.name)) return true;
    const steps = job.steps;
    if (!Array.isArray(steps) || !steps.length || steps.some((step, index) =>
      !Number.isSafeInteger(step.number) || step.number < 1 || index > 0 && step.number <= steps[index - 1].number)) return false;
    const prepareName = "Run node scripts/delivery.mjs prepare 'release' crawler --ci";
    const failures = steps.filter(step => step.conclusion === "failure");
    const prepare = failures[0];
    const cleanup = job.name === "build-linux" ? "Post Checkout repository" : "Post Run actions/checkout@v4";
    return failures.length === 1 && prepare.name === prepareName && prepare.number > 1 &&
      steps.filter(step => step.name === prepareName).length === 1 &&
      steps.every(step => step.status === "completed" &&
        (step.number < prepare.number ? step.conclusion === "success" : step.number === prepare.number ? step === prepare :
          [cleanup, "Complete job"].includes(step.name) ? step.conclusion === "success" : step.conclusion === "skipped"));
  });
}

export function recoveryIdentity(tag, workspace = root) {
  const manifest = JSON.parse(readFileSync(resolve(workspace, manifestPath), "utf8"));
  const identity = Object.hasOwn(manifest.tags ?? {}, tag ?? "") ? manifest.tags[tag] : undefined;
  if (manifest.schemaVersion !== 1 || manifest.repository !== "SlamTheDragon/vrc-packages" ||
      !Object.hasOwn(recoveryWorkflows, identity?.product ?? "") || tag !== `${productTagPrefixes[identity.product]}/v${identity.version}` ||
      !(identity.product === "crawler" ? /^0\.0\.[0-9]+$/ : identity.product === "network" ? /^\d{4}\.(?:[1-9]|1[0-2])\.\d+$/ : /^\d{2}\.(?:[1-9]|1[0-2])\.\d+-pre$/).test(identity.version) ||
      !sha(identity.commit) || !sha(identity.tagObject) ||
      (identity.failedStage !== undefined && (identity.product !== "crawler" || identity.failedStage !== "dependency-prepare")) ||
      !Number.isSafeInteger(identity.failedRun) || identity.failedRun < 1) {
    throw new Error("Recovery requires an exact owner-reviewed product identity. No version or tag changes are permitted.");
  }
  return { ...identity, tag, repository: manifest.repository };
}

/** This only selects a candidate. Every caller must also check its remote evidence. */
export function recoveryRunMatches(run, identity) {
  return run?.event === "workflow_dispatch" && run.head_branch === "main" && sha(run.head_sha) &&
    run.head_repository?.full_name === identity.repository && run.path === workflowFor(identity) &&
    run.display_title === `Recover ${identity.product} ${identity.tag}` && run.actor?.type === "User" &&
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
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.total_count >= 100) {
    throw new Error("Recovery requires complete original job evidence.");
  }
  // GitHub adds commit-level terminal checks to an earlier run's jobs listing.
  // Exclude only the independently checked acknowledgment, never a workflow job.
  const workflowJobs = [];
  let acknowledgments = 0;
  for (const job of jobs.jobs ?? []) {
    if (job.name !== `VRCP Discord release: ${identity.tag}`) { workflowJobs.push(job); continue; }
    if (++acknowledgments > 1 || !Number.isSafeInteger(job.id) || job.runner_id !== null ||
        !Array.isArray(job.labels) || job.labels.length || job.status !== "completed" || job.conclusion !== "success") {
      throw new Error("Unverified terminal check in failed-run evidence.");
    }
    const check = await api(`${base}/check-runs/${job.id}`);
    if (check.id !== job.id || check.name !== job.name || check.app?.slug !== "github-actions" ||
        check.head_sha !== identity.commit || check.status !== "completed" || check.conclusion !== "success" ||
        !/^discord:[1-9][0-9]*$/.test(check.external_id ?? "")) {
      throw new Error("Terminal check identity differs from its acknowledgment.");
    }
  }
  let failedStageMatches;
  if (identity.failedStage === "dependency-prepare") {
    failedStageMatches = dependencyPreparationFailed(workflowJobs);
  } else {
    const failedJob = identity.product === "crawler" ? "route" : "build";
    failedStageMatches = workflowJobs.some(job => job.name === failedJob && job.conclusion === "failure") &&
      !workflowJobs.some(job => job.name !== failedJob && job.conclusion !== "skipped");
  }
  if (failed.event !== "push" || failed.head_branch !== identity.tag || failed.head_sha !== identity.commit ||
      failed.path !== workflowFor(identity) || failed.head_repository?.full_name !== identity.repository ||
      failed.status !== "completed" || failed.conclusion !== "failure" ||
      !failedStageMatches ||
      artifacts.total_count !== 0 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== 0) {
    throw new Error("Recovery requires the authorized failed job with no publication or artifact output.");
  }
  return { ...identity, toolingCommit: run.head_sha, recoveryRun: run.id };
}

export function ciSourceCommit(env = process.env, workspace = root) {
  return env.VRCP_RECOVERY_TAG ? recoveryIdentity(env.VRCP_RECOVERY_TAG, workspace).commit : env.GITHUB_SHA;
}

export function checkRecoveryReceipts(files, proof) {
  const names = proof.product === "crawler" ? ["crawler-linux.receipt.json", "crawler-windows.receipt.json"]
    : proof.product === "crawler-client" ? ["crawler-client.receipt.json"] : [`vrc-packages-network-${proof.version}.tgz.json`];
  for (const name of names) {
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
  if (product !== identity.product || channel !== (identity.product === "crawler" ? "release" : "preview") || env.GITHUB_ACTIONS !== "true" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_REPOSITORY !== identity.repository || !sha(env.GITHUB_SHA) || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Recovery execution requires the dedicated owner-dispatched main workflow.");
  }
  const run = await api(`/repos/${identity.repository}/actions/runs/${env.GITHUB_RUN_ID}`);
  if (String(run.id) !== env.GITHUB_RUN_ID || run.head_sha !== env.GITHUB_SHA) throw new Error("Recovery run identity differs.");
  const proof = await checkRecoveryRun(run, identity, api);
  if (readGit(workspace, "rev-parse", "HEAD").trim() !== identity.commit ||
      readGit(workspace, "diff", identity.commit, "--", productDirectories[product], "config.versions.json", "config.preview.versions.json").trim()) {
    throw new Error("Recovery product source or saved version configs differ from the immutable tag.");
  }
  if (channel === "release") await checkReleaseSource({ product, channel, version: identity.version }, identity, api, readGit, workspace);
  else await checkRemoteTag((_method, path) => api(path), identity.repository, identity.tag, identity.commit, identity.tagObject);
  return proof;
}

/** A manual retry can use repaired tooling only when every earlier attempt failed without outputs. */
export async function checkRecoveryRetry(attempts, identity, toolingCommit, api = readGitHubAPI()) {
  if (!attempts.length) throw new Error("Manual recovery retry requires an existing failed attempt.");
  for (const attempt of attempts) {
    await checkRecoveryRun(attempt, identity, api);
    if (attempt.status !== "completed" || attempt.conclusion !== "failure" || attempt.head_sha === toolingCommit) {
      throw new Error("Retry requires a failed attempt and different reviewed tooling. Active or same-tooling runs need manual inspection.");
    }
    const base = `/repos/${identity.repository}/actions/runs/${attempt.id}`;
    const jobs = await api(`${base}/jobs?per_page=100`);
    const artifacts = await api(`${base}/artifacts?per_page=100`);
    if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.total_count >= 100 ||
        !jobs.jobs.some(job => job.conclusion === "failure") ||
        jobs.jobs.some(job => !["success", "failure", "skipped"].includes(job.conclusion)) ||
        jobs.jobs.some(job => /publish|release-assets|attach|announce/i.test(job.name) && job.conclusion !== "skipped") ||
        artifacts.total_count !== 0 || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== 0 ||
        identity.failedStage === "dependency-prepare" && !dependencyPreparationFailed(jobs.jobs)) {
      throw new Error("Retry cannot rebuild an attempt with outputs, publication activity or incomplete evidence.");
    }
  }
  return attempts.map(attempt => attempt.id);
}

/** Explicit dispatch only. No automatic rerun, tag update, version bump or local release artifact. */
export async function recoverDelivery(tag, execute = false, workspace = root, api = readGitHubAPI(), dispatch = dispatchRecovery, retry = false) {
  const identity = recoveryIdentity(tag, workspace);
  const configs = Object.fromEntries(["release", "preview"].map(channel => [channel, JSON.parse(git(workspace,
    "show", `${identity.commit}:${channel === "release" ? "config.versions.json" : "config.preview.versions.json"}`))]));
  const selected = selectTag(tag, configs);
  if (selected.channel === "release") await checkReleaseSource(selected, identity, api, git, workspace);
  else await checkRemoteTag((_method, path) => api(path), identity.repository, tag, identity.commit, identity.tagObject);
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
    head_repository: { full_name: identity.repository }, path: workflowFor(identity),
    display_title: `Recover ${identity.product} ${tag}`, actor: { login: identity.repository.split("/")[0], type: "User" } };
  await checkRecoveryRun(run, identity, api);
  const listing = await api(`/repos/${identity.repository}/actions/workflows/${recoveryWorkflows[identity.product]}.yml/runs?event=workflow_dispatch&per_page=100`);
  if (!Array.isArray(listing.workflow_runs) || listing.workflow_runs.length >= 100) throw new Error("Recovery listing exceeds its bound.");
  const attempts = listing.workflow_runs.filter(candidate => recoveryRunMatches(candidate, identity));
  if (attempts.length && !retry) return { ...identity, toolingCommit, status: "existing-recovery-attempt", readOnly: true,
    attempts: attempts.map(attempt => ({ run: attempt.id, status: attempt.status, conclusion: attempt.conclusion, url: attempt.html_url })),
    next: "Inspect this exact attempt. CI retries and ambiguous partial publication require manual resolution." };
  const retryOf = retry ? await checkRecoveryRetry(attempts, identity, toolingCommit, api) : [];
  const releases = await api(`/repos/${identity.repository}/releases?per_page=100`);
  if (!Array.isArray(releases) || releases.length >= 100 || releases.some(release => release.tag_name === tag)) {
    throw new Error("Recovery cannot rebuild a version with an existing Release or incomplete publication evidence.");
  }
  const plan = { ...identity, toolingCommit, retryOf, status: "recovery-plan", readOnly: true, ref: "main", workflow: `${recoveryWorkflows[identity.product]}.yml` };
  if (!execute) return plan;
  if (git(workspace, "symbolic-ref", "--short", "HEAD").trim() !== "main" || git(workspace, "status", "--porcelain").trim() ||
      git(workspace, "ls-remote", "origin", "refs/heads/main").trim().split(/\s+/)[0] !== toolingCommit) {
    throw new Error("Recovery dispatch requires clean synchronized main after owner review and merge.");
  }
  await dispatch(identity.repository, tag);
  return { ...plan, status: "recovery-dispatched", readOnly: false,
    next: "Inspect the owner-dispatched product workflow, retain applicable release approvals, then run delivery:check for this unchanged tag." };
}

async function dispatchRecovery(repository, tag) {
  const identity = recoveryIdentity(tag);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Recovery dispatch needs an explicit GitHub credential with repository Actions write permission.");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${recoveryWorkflows[identity.product]}.yml/dispatches`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { "recovery-tag": tag } }) });
  await response.body?.cancel();
  if (response.status !== 204) throw new Error(`Recovery dispatch failed (HTTP ${response.status}). Check Actions write scope. No automatic retry ran.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
  const [tag, ...flags] = process.argv.slice(2);
  try {
    if (!tag || new Set(flags).size !== flags.length || flags.some(flag => !["--execute", "--retry"].includes(flag))) {
      throw new Error("Use delivery:recover <exact-tag> [--retry] [--execute].");
    }
    const result = await recoverDelivery(tag, flags.includes("--execute"), root, readGitHubAPI(), dispatchRecovery, flags.includes("--retry"));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "tooling-promotion-required") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  })();
}
