import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseSource, readGitHubAPI, selectTag } from "./delivery.mjs";
import { productDirectories, productTagPrefixes } from "./versioning.mjs";
import { checkRemoteTag } from "./release-assets.mjs";
import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";

const root = fileURLToPath(new URL("../", import.meta.url));

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY ?? true);
const c = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  green: useColor ? "\x1b[32m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  red: useColor ? "\x1b[31m" : "",
  magenta: useColor ? "\x1b[35m" : ""
};

const manifestPath = ".github/delivery-recoveries.json";
const recoveryWorkflows = { crawler: "node-docker", network: "network", "crawler-client": "node-client" };
const workflowFor = identity => `.github/workflows/${recoveryWorkflows[identity.product]}.yml`;
const sha = value => /^[a-f0-9]{40}$/.test(value ?? "");
const git = (workspace, ...args) => execFileSync("git", args, {
  cwd: workspace, encoding: "utf8", timeout: 30_000, stdio: "pipe",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" } });

function getGitHubToken(workspace = root) {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.RELEASE_TOKEN) return process.env.RELEASE_TOKEN;
  try {
    const out = execFileSync("git", ["credential", "fill"], {
      cwd: workspace,
      input: "protocol=https\nhost=github.com\n\n",
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" }
    });
    const token = out.split("\n").find(l => l.startsWith("password="))?.slice(9).trim();
    if (token) return token;
  } catch {}
  return undefined;
}

function builderStepFailed(jobs, expectedStepName) {
  const isExpectedStep = typeof expectedStepName === "function"
    ? expectedStepName
    : name => name === expectedStepName || (expectedStepName === "Run bun test ./tests" && name === "Test crawler node");
  const expected = new Map([["route", "success"], ["build-linux", "failure"],
    ["standalone-windows", "failure"], ["publish-container", "skipped"], ["release-assets", "skipped"]]);
  return jobs.length === expected.size && jobs.every(job => {
    if (expected.get(job.name) !== job.conclusion || !expected.delete(job.name)) return false;
    if (!["build-linux", "standalone-windows"].includes(job.name)) return true;
    const steps = job.steps;
    if (!Array.isArray(steps) || !steps.length || steps.some((step, index) =>
      !Number.isSafeInteger(step.number) || step.number < 1 || index > 0 && step.number <= steps[index - 1].number)) return false;
    const failures = steps.filter(step => step.conclusion === "failure");
    const failedStep = failures[0];
    const cleanup = job.name === "build-linux" ? "Post Checkout repository" : "Post Run actions/checkout@v4";
    return failures.length === 1 && isExpectedStep(failedStep.name) && failedStep.number > 1 &&
      steps.filter(step => isExpectedStep(step.name)).length === 1 &&
      steps.every(step => step.status === "completed" &&
        (step.number < failedStep.number
          ? (step.name === "Restore reviewed recovery tooling only" ? ["skipped", "success"].includes(step.conclusion) : step.conclusion === "success")
          : step.number === failedStep.number ? step === failedStep :
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
      (identity.failedStage !== undefined && (identity.product !== "crawler" || !["dependency-prepare", "test-failed"].includes(identity.failedStage))) ||
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
    failedStageMatches = builderStepFailed(workflowJobs, "Run node scripts/delivery.mjs prepare 'release' crawler --ci");
  } else if (identity.failedStage === "test-failed") {
    failedStageMatches = builderStepFailed(workflowJobs, "Run bun test ./tests");
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
    if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.total_count >= 100 ||
        !jobs.jobs.some(job => job.conclusion === "failure") ||
        jobs.jobs.some(job => !["success", "failure", "skipped"].includes(job.conclusion)) ||
        jobs.jobs.some(job => /publish|release-assets|attach|announce/i.test(job.name) && job.conclusion !== "skipped") ||
        (identity.failedStage === "dependency-prepare" && !builderStepFailed(jobs.jobs, "Run node scripts/delivery.mjs prepare 'release' crawler --ci")) ||
        (identity.failedStage === "test-failed" && !builderStepFailed(jobs.jobs, "Run bun test ./tests"))) {
      throw new Error("Retry cannot rebuild an attempt with publication activity or incomplete evidence.");
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
  const token = getGitHubToken();
  if (!token) throw new Error("Recovery dispatch needs an explicit GitHub credential with repository Actions write permission.");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${recoveryWorkflows[identity.product]}.yml/dispatches`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { "recovery-tag": tag } }) });
  await response.body?.cancel();
  if (response.status !== 204) throw new Error(`Recovery dispatch failed (HTTP ${response.status}). Check Actions write scope. No automatic retry ran.`);
}

/**
 * Discover and write a recovery manifest entry without manual JSON editing.
 * Resolves the tag's commit and tagObject from the GitHub API, then locates the
 * most recent failed push run for that tag (or uses an explicit runId). Dry-runs
 * without --execute; commits the manifest change when --execute is given.
 */
export async function authorizeRecovery(tag, options = {}, workspace = root, api = readGitHubAPI()) {
  const { execute = false, failedRunId } = options;
  // Resolve product from tag prefix.
  const product = Object.keys(recoveryWorkflows).find(p =>
    tag.startsWith(`${productTagPrefixes[p]}/`));
  if (!product) throw new Error(`Tag ${tag} does not match a recoverable product prefix.`);
  const expected = `${productTagPrefixes[product]}/v`;
  const version = tag.startsWith(expected) ? tag.slice(expected.length) : null;
  if (!version) throw new Error(`Tag ${tag} does not follow the expected ${expected}<version> format.`);

  // Read the repository from the existing manifest (required field, avoids hardcoding).
  const manifest = JSON.parse(readFileSync(resolve(workspace, manifestPath), "utf8"));
  if (manifest.schemaVersion !== 1 || typeof manifest.repository !== "string")
    throw new Error("Recovery manifest is missing or has an unsupported schema version.");
  const repository = manifest.repository;

  // Fetch the remote tag to get the commit SHA and tag object SHA.
  const remoteTag = await api(`/repos/${repository}/git/refs/tags/${tag}`);
  if (remoteTag.ref !== `refs/tags/${tag}` || remoteTag.object?.type !== "tag")
    throw new Error(`Remote tag ${tag} is not an annotated tag or does not exist.`);
  const tagObject = remoteTag.object.sha;
  if (!sha(tagObject)) throw new Error("Remote tag object SHA is invalid.");
  const tagData = await api(`/repos/${repository}/git/tags/${tagObject}`);
  const commit = tagData.object?.sha;
  if (!sha(commit)) throw new Error("Could not resolve tag commit SHA.");

  // Find the failed run: use the explicit ID or search recent push runs on the tag branch.
  let failedRun;
  if (failedRunId) {
    const run = await api(`/repos/${repository}/actions/runs/${failedRunId}`);
    if (run.event !== "push" || run.head_branch !== tag || run.head_sha !== commit ||
        run.status !== "completed" || run.conclusion !== "failure")
      throw new Error(`Run ${failedRunId} is not a completed failed push run for ${tag}.`);
    failedRun = failedRunId;
  } else {
    const runs = await api(`/repos/${repository}/actions/workflows/${recoveryWorkflows[product]}.yml/runs?event=push&per_page=30`);
    const candidate = runs.workflow_runs?.find(r =>
      r.head_branch === tag && r.head_sha === commit && r.status === "completed" && r.conclusion === "failure");
    if (!candidate) throw new Error(`No failed push run found for ${tag} at ${commit}. Use --failed-run <id> to specify it.`);
    failedRun = candidate.id;
  }

  // Build the manifest entry — omit failedStage unless dependency-prepare applies.
  const entry = { product, version, commit, tagObject, failedRun };

  const proposed = { ...manifest, tags: { [tag]: entry, ...manifest.tags } };
  const json = JSON.stringify(proposed, null, 2) + "\n";

  if (!execute) {
    return { tag, entry, status: "authorize-plan", readOnly: true,
      next: "Review the entry above, then rerun with --execute to write and commit the manifest." };
  }

  writeFileSync(resolve(workspace, manifestPath), json, "utf8");
  const cleanCommit = git(workspace, "status", "--porcelain").trim() ? null : "clean";
  if (!cleanCommit) {
    git(workspace, "add", manifestPath);
    git(workspace, "commit", "-m", `Authorize recovery for ${tag} routing failure`);
  }
  return { tag, entry, status: "authorize-committed", readOnly: false,
    next: `Push the commit to main, then run: delivery:recover ${tag} --execute` };
}

export function diagnoseFailure(context = {}) {
  const errorMsg = typeof context.error === "string" ? context.error : context.error?.message ?? "";
  const jobs = Array.isArray(context.jobs) ? context.jobs : [];
  const failedJobs = jobs.filter(j => ["failure", "cancelled", "timed_out", "action_required", "startup_failure"].includes(j.conclusion));
  const failedNames = failedJobs.map(j => j.name);

  // Transient failure detection (network glitch, timeout, runner shutdown)
  const isTransientError = /timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up|rate limit|fetch failed|network|503|502|runner_listener|startup_failure/i.test(errorMsg);
  const isTransientJob = failedJobs.some(j => j.conclusion === "timed_out" || j.conclusion === "startup_failure");
  if (isTransientError || isTransientJob) {
    return {
      category: "transient",
      severity: "low",
      continuity: "resumable",
      rootCause: isTransientJob ? `Job(s) timed out or had startup failures: ${failedNames.join(", ")}` : `Transient network/service error: ${errorMsg}`,
      suggestedActions: ["rerun-failed-jobs", "rerun-run"]
    };
  }

  // Tag, version, branch or release collision
  const isCollision = /already exists|Reference already exists|Local tag already exists|Remote tag differs|Release preparation branch already exists|version config is behind|Divergent|rejected/i.test(errorMsg);
  if (isCollision) {
    return {
      category: "collision",
      severity: "medium",
      continuity: "requires-reversion",
      rootCause: `Tag, version, or branch collision: ${errorMsg}`,
      suggestedActions: ["revert-tag", "sync-versions"]
    };
  }

  // Code, test or build defect
  const isDefect = /test|failed.*test|vitest|bun test|syntax error|compilation|tsc|build-or-runtime-check|missing.*asset|missing.*receipt/i.test(errorMsg) ||
    failedNames.some(n => /test|build|compile|check/i.test(n));
  if (isDefect || failedNames.length > 0) {
    return {
      category: "defect",
      severity: "critical",
      continuity: "requires-patch",
      rootCause: failedNames.length > 0 ? `Build or test failure in job(s): ${failedNames.join(", ")}` : `Code or verification defect: ${errorMsg}`,
      suggestedActions: ["create-patch-branch", "abort"]
    };
  }

  return {
    category: "unknown",
    severity: "high",
    continuity: "requires-investigation",
    rootCause: errorMsg || "Unclassified failure during pipeline execution",
    suggestedActions: ["inspect-run", "create-patch-branch", "abort"]
  };
}

export async function rerunWorkflowRun(repository, runId, options = {}) {
  const { failedJobsOnly = true, token = options.token || getGitHubToken(), fetchFn = fetch } = options;
  if (!token) throw new Error("Workflow rerun requires GitHub credential with actions write permission.");
  const endpoint = failedJobsOnly
    ? `https://api.github.com/repos/${repository}/actions/runs/${runId}/rerun-failed-jobs`
    : `https://api.github.com/repos/${repository}/actions/runs/${runId}/rerun`;
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "VRCPDelivery",
      accept: "application/vnd.github+json"
    }
  });
  if (!response.ok && response.status !== 201) {
    throw new Error(`Failed to dispatch rerun for run ${runId}: HTTP ${response.status}`);
  }
  return { status: "rerun-dispatched", runId, failedJobsOnly };
}

export async function revertDeliveryTag(tag, options = {}) {
  const { workspace = root, readGit = git, deleteRemote = false, repository = "SlamTheDragon/vrc-packages", token = options.token || getGitHubToken(workspace), fetchFn = fetch } = options;
  let localDeleted = false;
  let remoteDeleted = false;
  try {
    readGit(workspace, "tag", "-d", tag);
    localDeleted = true;
  } catch {}
  if (deleteRemote) {
    if (!token) throw new Error("Deleting remote tag requires a GitHub token with write permission.");
    const response = await fetchFn(`https://api.github.com/repos/${repository}/git/refs/tags/${encodeURIComponent(tag)}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "VRCPDelivery",
        accept: "application/vnd.github+json"
      }
    });
    if (response.ok || response.status === 204 || response.status === 404) {
      remoteDeleted = true;
    } else {
      throw new Error(`Failed to delete remote tag ${tag}: HTTP ${response.status}`);
    }
  }
  return { status: "tag-reverted", tag, local: localDeleted, remote: remoteDeleted };
}

export function createPatchBranch(product, version, options = {}) {
  const {
    workspace = root,
    readGit = git,
    baseBranch,
    tag = productTagPrefixes[product] ? `${productTagPrefixes[product]}/v${version}` : undefined,
    deleteTag = true
  } = options;
  if (!product || !version) throw new Error("createPatchBranch requires product and version");
  const branchName = `release/patch/${product}/v${version}`;
  const currentBranch = baseBranch || readGit(workspace, "symbolic-ref", "--short", "HEAD").trim();
  try {
    readGit(workspace, "config", "vrcp.patch.previousBranch", currentBranch);
  } catch {}

  // Switch branch along side the patch
  readGit(workspace, "checkout", "-b", branchName);

  // Delete premature or advanced tag if one was created
  let tagDeleted = false;
  if (deleteTag && tag) {
    try {
      readGit(workspace, "tag", "-d", tag);
      tagDeleted = true;
    } catch {}
  }

  return {
    status: "patch-branch-created",
    branch: branchName,
    previousBranch: currentBranch,
    tagDeleted: tagDeleted ? tag : null,
    instruction: `Switched to temporary patch branch '${branchName}'${tagDeleted ? ` (deleted tag ${tag})` : ""}. Make code fixes, commit them, then run merge-patch.`
  };
}

export function mergeAndCleanupPatchBranch(product, version, options = {}) {
  const { workspace = root, readGit = git, targetBranch } = options;
  if (!product || !version) throw new Error("mergeAndCleanupPatchBranch requires product and version");
  const branchName = `release/patch/${product}/v${version}`;
  const dirty = readGit(workspace, "status", "--porcelain").trim();
  if (dirty) {
    throw new Error(`Cannot merge patch branch '${branchName}': worktree has uncommitted changes.`);
  }
  let destination = targetBranch;
  if (!destination) {
    try {
      destination = readGit(workspace, "config", "--get", "vrcp.patch.previousBranch").trim();
    } catch {}
  }
  if (!destination) destination = "main";
  readGit(workspace, "checkout", destination);
  readGit(workspace, "merge", "--no-ff", branchName, "-m", `merge: apply patch fixes from ${branchName}`);
  readGit(workspace, "branch", "-D", branchName);
  try {
    readGit(workspace, "config", "--unset", "vrcp.patch.previousBranch");
  } catch {}
  return {
    status: "patch-branch-merged-and-deleted",
    branch: branchName,
    mergedInto: destination,
    prompt: `Patch branch '${branchName}' merged into '${destination}' and deleted. You may now restart the local pipeline cleanly.`
  };
}

export async function promptInteractiveRecovery(context = {}, options = {}) {
  const {
    input = process.stdin,
    output = process.stdout,
    askFn,
    onProgress = console.log,
    workspace = root,
    readGit = git,
    repository = "SlamTheDragon/vrc-packages",
    token = options.token || getGitHubToken(workspace),
    fetchFn = fetch
  } = options;

  const isInteractiveTTY = !askFn && Boolean(process.stdin.isTTY) && !process.env.CI;

  let rl;
  const ask = askFn || (async query => {
    if (!rl) {
      const readline = await import("node:readline/promises");
      rl = readline.createInterface({ input, output });
    }
    return (await rl.question(query)).trim();
  });

  try {
    const diagnosis = diagnoseFailure(context);

    if (isInteractiveTTY) {
      p.intro(`${c.bold}${c.cyan}VRCP Delivery Failure Recovery Console${c.reset}`);
      p.note(
        `Category:   ${diagnosis.category.toUpperCase()} (Severity: ${diagnosis.severity})\nRoot Cause: ${diagnosis.rootCause}\nContinuity: ${diagnosis.continuity}\nActions:    ${diagnosis.suggestedActions.join(", ")}`,
        "Failure Diagnosis"
      );
    } else {
      onProgress(`\n${c.bold}${c.cyan}◆ VRCP Delivery Failure Recovery Console${c.reset}`);
      onProgress(`${c.dim}  Interactive incident remediation, tag rollback, and patch branch orchestration${c.reset}\n`);
      onProgress(`${c.bold}┌── 🩺 Failure Diagnosis${c.reset}`);
      onProgress(`│  Failure Category:   ${c.bold}${diagnosis.category.toUpperCase()}${c.reset} (Severity: ${diagnosis.severity})`);
      onProgress(`│  Root Cause:          ${c.yellow}${diagnosis.rootCause}${c.reset}`);
      onProgress(`│  Continuity Impact:   ${diagnosis.continuity}`);
      onProgress(`│  Suggested Action(s): ${c.cyan}${diagnosis.suggestedActions.join(", ")}${c.reset}`);
      onProgress(`│`);
      onProgress(`${c.bold}└── 🛠  Available Remediation Options${c.reset}`);
      onProgress(`   ${c.yellow}1)${c.reset} Rerun failed CI jobs (transient failure)`);
      onProgress(`   ${c.yellow}2)${c.reset} Revert delivery tag locally (collision/abort)`);
      onProgress(`   ${c.yellow}3)${c.reset} Switch to temporary patch branch (release/patch/*) and revert tag`);
      onProgress(`   ${c.yellow}4)${c.reset} Merge and clean up temporary patch branch`);
      onProgress(`   ${c.yellow}5)${c.reset} Abort and exit\n`);
    }

    let choice = "5";
    if (isInteractiveTTY) {
      const res = await p.select({
        message: "Select remediation option:",
        options: [
          { value: "1", label: "Rerun failed CI jobs", hint: "Transient runner/network failure" },
          { value: "2", label: "Revert delivery tag locally", hint: "Collision / aborted release" },
          { value: "3", label: "Switch to temporary patch branch", hint: "release/patch/* development" },
          { value: "4", label: "Merge and clean up patch branch", hint: "After fixes are committed" },
          { value: "5", label: "Abort and exit" }
        ],
        initialValue: "1"
      });
      if (p.isCancel(res)) {
        p.cancel("Recovery cancelled.");
        return { status: "recovery-aborted" };
      }
      choice = String(res);
    } else {
      choice = await ask("Select remediation option [1-5]: ");
    }

    if (choice === "1") {
      if (!context.runId) throw new Error("No runId available in context to rerun.");
      if (isInteractiveTTY) {
        const s = p.spinner();
        s.start(`Rerunning failed jobs for workflow run #${context.runId}...`);
        const res = await rerunWorkflowRun(repository, context.runId, { failedJobsOnly: true, token, fetchFn });
        s.stop("Rerun dispatched successfully.");
        p.outro("Rerun complete.");
        return res;
      } else {
        onProgress(`  ${c.cyan}◆${c.reset} Rerunning failed jobs for workflow run #${context.runId}...`);
        const res = await rerunWorkflowRun(repository, context.runId, { failedJobsOnly: true, token, fetchFn });
        onProgress(`  ${c.green}✓${c.reset} Rerun dispatched successfully.`);
        return res;
      }
    } else if (choice === "2") {
      if (!context.tag) throw new Error("No tag specified in context to revert.");
      if (isInteractiveTTY) {
        const s = p.spinner();
        s.start(`Reverting delivery tag ${context.tag}...`);
        const res = await revertDeliveryTag(context.tag, { workspace, readGit, deleteRemote: false, repository, token, fetchFn });
        s.stop(`Local tag ${context.tag} deleted.`);
        p.outro("Tag rollback complete.");
        return res;
      } else {
        onProgress(`  ${c.cyan}◆${c.reset} Reverting delivery tag ${context.tag}...`);
        const res = await revertDeliveryTag(context.tag, { workspace, readGit, deleteRemote: false, repository, token, fetchFn });
        onProgress(`  ${c.green}✓${c.reset} Local tag ${context.tag} deleted.`);
        return res;
      }
    } else if (choice === "3") {
      let product = context.product;
      let version = context.version;
      if (isInteractiveTTY) {
        if (!product) {
          product = await p.select({
            message: "Select product for patch branch:",
            options: Object.keys(productDirectories).map(k => ({ value: k, label: k }))
          });
          if (p.isCancel(product)) { p.cancel("Recovery cancelled."); return { status: "recovery-aborted" }; }
        }
        if (!version) {
          version = await p.text({ message: "Enter version string (e.g. 0.0.12):" });
          if (p.isCancel(version)) { p.cancel("Recovery cancelled."); return { status: "recovery-aborted" }; }
        }
      } else {
        if (!product) product = await ask("Enter product name: ");
        if (!version) version = await ask("Enter version string: ");
      }
      const tag = context.tag || (productTagPrefixes[product] ? `${productTagPrefixes[product]}/v${version}` : undefined);
      if (isInteractiveTTY) {
        const s = p.spinner();
        s.start(`Switching to patch branch for ${product} v${version}...`);
        const res = createPatchBranch(product, version, { workspace, readGit, tag });
        s.stop(`Switched to patch branch ${res.branch}`);
        p.note(res.instruction, "Branch Instructions");
        p.outro("Patch branch creation complete.");
        return res;
      } else {
        onProgress(`  ${c.cyan}◆${c.reset} Switching to patch branch for ${product} v${version} and cleaning up tag ${tag || ""}...`);
        const res = createPatchBranch(product, version, { workspace, readGit, tag });
        if (res.tagDeleted) {
          onProgress(`  ${c.green}✓${c.reset} Reverted premature delivery tag ${res.tagDeleted}`);
        }
        onProgress(res.instruction);
        return res;
      }
    } else if (choice === "4") {
      let product = context.product;
      let version = context.version;
      if (isInteractiveTTY) {
        if (!product) {
          product = await p.select({
            message: "Select product for patch branch merge:",
            options: Object.keys(productDirectories).map(k => ({ value: k, label: k }))
          });
          if (p.isCancel(product)) { p.cancel("Recovery cancelled."); return { status: "recovery-aborted" }; }
        }
        if (!version) {
          version = await p.text({ message: "Enter version string (e.g. 0.0.12):" });
          if (p.isCancel(version)) { p.cancel("Recovery cancelled."); return { status: "recovery-aborted" }; }
        }
        const s = p.spinner();
        s.start(`Merging and cleaning up patch branch for ${product} v${version}...`);
        const res = mergeAndCleanupPatchBranch(product, version, { workspace, readGit });
        s.stop(`Merged patch branch ${res.branch}`);
        p.note(res.prompt, "Next Steps");
        p.outro("Patch branch merged successfully.");
        return res;
      } else {
        if (!product) product = await ask("Enter product name: ");
        if (!version) version = await ask("Enter version string: ");
        onProgress(`  ${c.cyan}◆${c.reset} Merging and cleaning up patch branch for ${product} v${version}...`);
        const res = mergeAndCleanupPatchBranch(product, version, { workspace, readGit });
        onProgress(res.prompt);
        return res;
      }
    } else {
      if (isInteractiveTTY) {
        p.outro("Recovery cancelled by user.");
      } else {
        onProgress(`  ${c.dim}Recovery cancelled by user.${c.reset}`);
      }
      return { status: "recovery-aborted" };
    }
  } finally {
    if (rl) rl.close();
  }
}

export const main = defineCommand({
  meta: {
    name: "recovery",
    description: "Delivery failure diagnosis, patch branch orchestration, and remediation"
  },
  args: {
    subcommand: {
      type: "positional",
      description: "Subcommand: interactive, recover, authorize, patch-branch, rerun, revert-tag, diagnose, or <tag>",
      required: false,
      default: "interactive"
    },
    arg1: { type: "positional", required: false, description: "First positional argument (tag, action, or runId)" },
    arg2: { type: "positional", required: false, description: "Second positional argument (version, product, or commit)" },
    arg3: { type: "positional", required: false, description: "Third positional argument" },
    execute: { type: "boolean", default: false, description: "Execute remote mutation" },
    retry: { type: "boolean", default: false, description: "Allow retry of prior attempt" },
    failedRun: { type: "string", description: "Failed GitHub workflow run ID" },
    remote: { type: "boolean", default: false, description: "Delete remote tag as well" },
    all: { type: "boolean", default: false, description: "Rerun all jobs instead of failed only" }
  },
  async run() {
    const [rawSubcommand, ...rest] = process.argv.slice(2);
    const subcommand = rawSubcommand ? rawSubcommand.toLowerCase() : "interactive";
    try {
      if (subcommand === "authorize") {
        const [tag, ...flags] = rest;
        if (!tag || new Set(flags).size !== flags.length ||
            flags.some(flag => !["--execute", "--failed-run"].includes(flag) && !/^[1-9][0-9]*$/.test(flag))) {
          throw new Error("Use: delivery-recovery.mjs authorize <exact-tag> [--failed-run <runId>] [--execute]");
        }
        const failedRunIdx = flags.indexOf("--failed-run");
        const failedRunId = failedRunIdx >= 0 ? Number(flags[failedRunIdx + 1]) : undefined;
        const result = await authorizeRecovery(tag, { execute: flags.includes("--execute"), failedRunId }, root, readGitHubAPI());
        console.log(JSON.stringify(result, null, 2));
      } else if (subcommand === "patch-branch") {
        const [action, product, version] = rest;
        if (action === "create") {
          const res = createPatchBranch(product, version);
          console.log(JSON.stringify(res, null, 2));
        } else if (action === "merge") {
          const res = mergeAndCleanupPatchBranch(product, version);
          console.log(JSON.stringify(res, null, 2));
        } else {
          throw new Error("Use: delivery-recovery.mjs patch-branch <create|merge> <product> <version>");
        }
      } else if (subcommand === "rerun") {
        const [runId, ...flags] = rest;
        if (!runId || !/^[1-9][0-9]*$/.test(runId)) throw new Error("Use: delivery-recovery.mjs rerun <runId> [--all]");
        const res = await rerunWorkflowRun("SlamTheDragon/vrc-packages", Number(runId), { failedJobsOnly: !flags.includes("--all") });
        console.log(JSON.stringify(res, null, 2));
      } else if (subcommand === "revert-tag") {
        const [tag, ...flags] = rest;
        if (!tag) throw new Error("Use: delivery-recovery.mjs revert-tag <tag> [--remote]");
        const res = await revertDeliveryTag(tag, { deleteRemote: flags.includes("--remote") });
        console.log(JSON.stringify(res, null, 2));
      } else if (subcommand === "interactive" || subcommand === "recover-interactive") {
        const [tag, runId] = rest;
        const res = await promptInteractiveRecovery({ tag, runId: runId ? Number(runId) : undefined });
        console.log(JSON.stringify(res, null, 2));
      } else if (subcommand === "diagnose") {
        const [tag] = rest;
        const res = diagnoseFailure({ tag, error: tag });
        console.log(JSON.stringify(res, null, 2));
      } else if (subcommand === "recover" || subcommand?.includes("/v")) {
        const tag = subcommand === "recover" ? rest[0] : rawSubcommand;
        const flags = subcommand === "recover" ? rest.slice(1) : rest;
        if (!tag || new Set(flags).size !== flags.length || flags.some(flag => !["--execute", "--retry"].includes(flag))) {
          throw new Error("Use: delivery-recovery.mjs recover <exact-tag> [--retry] [--execute]");
        }
        const result = await recoverDelivery(tag, flags.includes("--execute"), root, readGitHubAPI(), dispatchRecovery, flags.includes("--retry"));
        console.log(JSON.stringify(result, null, 2));
        if (result.status === "tooling-promotion-required") process.exitCode = 1;
      } else {
        throw new Error("Unknown recovery command. Use: recover, authorize, patch-branch, rerun, revert-tag, diagnose, or interactive.");
      }
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain(main);
}
