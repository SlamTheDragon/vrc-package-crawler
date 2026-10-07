import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { ciSourceCommit, recoveryIdentity, requireRecoveryCI } from "./delivery-recovery.mjs";
import { bumpVersion, distributedArtifact, productDirectories, productTagPrefixes, readVersionConfig, sdkPackageNames, sdkChannelForProduct, versionFiles } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN && typeof process.loadEnvFile === "function") {
  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) {
    try { process.loadEnvFile(envFile); } catch {}
  } else {
    try { process.loadEnvFile(); } catch {}
  }
}
const artifacts = { "vrc-packages-api": "package", "vrc-packages-network": "network" };
const releaseWorkflows = { package: "vrc-packages-api", crawler: "node-docker", "crawler-client": "node-client", worker: "cloudflare-worker" };
const readGit = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, stdio: "pipe" });

export function checkSDKPublicationVersion(version, channel = "release", name = sdkPackageNames.release) {
  const parsed = semver.parse(version);
  if (channel === "preview" && name === sdkPackageNames.preview && parsed?.prerelease[0] === "pre") return;
  if (channel !== "release" || name !== sdkPackageNames.release || !parsed || parsed.major !== 0 || parsed.minor !== 0 || parsed.prerelease.length) {
    throw new Error("SDK publication requires a pre-0.1 version. The owner API review hold includes v0.1 prereleases.");
  }
}

/** Read GitHub metadata only; never consult local credential storage. */
export function readGitHubAPI(env = process.env, request = fetch) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  return async path => {
    if (typeof path !== "string" || !/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\//.test(path) ||
        /[\r\n#\\]/.test(path)) throw new Error("Expected a repository GitHub API path");
    const url = new URL(path, "https://api.github.com");
    if (url.origin !== "https://api.github.com" || !url.pathname.startsWith("/repos/")) throw new Error("Unexpected GitHub API origin");
    const response = await request(url.href, { redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/vnd.github+json", "cache-control": "no-cache", "user-agent": "VRCPDelivery",
        ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
        const reset = response.headers.get("x-ratelimit-reset") ?? "";
        const retry = /^\d{1,12}$/.test(reset) ? ` Retry after ${new Date(Number(reset) * 1000).toISOString()}.` : "";
        throw new Error(`Release proof metadata is rate-limited (${response.status}).${retry} No tag push ran. Use an explicit read credential or retry after the limit resets.`);
      }
      throw new Error(`Release proof metadata unavailable (${response.status}); an explicit read credential may be required`);
    }
    if (!response.body) throw new Error("Missing release proof metadata");
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1_048_576) throw new Error("Release proof metadata exceeds its limit");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new Error("Invalid release proof metadata JSON"); }
  };
}

/** Prove a single reviewed version commit. This does not authorize or perform a remote write. */
export async function checkReviewedRelease(selected, proof, api = readGitHubAPI()) {
  const { repository, commit, tag, prNumber, head, base, actor } = proof;
  const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const human = value => value?.type === "User" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.login ?? "");
  const timestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
      ![commit, head, base].every(sha) || head === base || !Number.isSafeInteger(prNumber) || prNumber < 1 ||
      selected?.channel !== "release" || !Object.hasOwn(productTagPrefixes, selected?.product ?? "") ||
      ["network", "web"].includes(selected.product) ||
      tag !== `${productTagPrefixes[selected.product]}/v${selected.version}` || semver.valid(selected.version) !== selected.version ||
      semver.prerelease(selected.version) !== null || (actor !== undefined && !human(actor))) {
    throw new Error("Invalid reviewed release identity or non-human release actor");
  }
  if (selected.product === "package") checkSDKPublicationVersion(selected.version);
  const prefix = `/repos/${repository}`, pull = `${prefix}/pulls/${prNumber}`;
  const pr = await api(pull);
  if (pr?.number !== prNumber || pr.state !== "closed" || pr.merged !== true || pr.draft !== false ||
      pr.base?.ref !== "main" || pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository ||
      pr.head?.sha !== head || pr.merge_commit_sha !== commit || pr.commits !== 1 || !human(pr.merged_by) ||
      pr.merged_by.login.toLowerCase() !== repository.split("/")[0].toLowerCase() ||
      !human(pr.user) || pr.auto_merge != null || !timestamp(pr.merged_at)) throw new Error("Release requires the exact merged main version PR");
  const commits = await api(`${pull}/commits?per_page=2`);
  if (!Array.isArray(commits) || commits.length !== 1 || commits[0]?.sha !== head ||
      commits[0].parents?.length !== 1 || commits[0].parents[0]?.sha !== base) {
    throw new Error("Version PR must contain one preparation commit based on the prepared main commit");
  }
  const prepared = await api(`${prefix}/commits/${head}`);
  const message = prepared?.commit?.message;
  if (prepared?.sha !== head || prepared.parents?.length !== 1 || prepared.parents[0]?.sha !== base || typeof message !== "string") {
    throw new Error("Invalid version preparation commit");
  }
  for (const [key, value] of Object.entries({ "VRCP-Release-Product": selected.product,
    "VRCP-Release-Version": selected.version, "VRCP-Release-Base": base })) {
    const lines = message.split(/\r?\n/).filter(line => line.startsWith(`${key}:`));
    if (lines.length !== 1 || lines[0] !== `${key}: ${value}`) throw new Error("Version preparation trailers differ from the selected release");
  }
  if (![`release/candidate/${selected.product}/v${selected.version}`, `codex/release/${selected.product}/v${selected.version}`].includes(pr.head.ref)) throw new Error("Unexpected version preparation branch");
  const merged = await api(`${prefix}/commits/${commit}`);
  if (merged?.sha !== commit || !Array.isArray(merged.parents) || ![1, 2].includes(merged.parents.length) ||
      !sha(merged.parents[0]?.sha) || (merged.parents.length === 2 && merged.parents[1]?.sha !== head)) {
    throw new Error("Main advanced beyond the reviewed preparation base");
  }
  let trackerParent;
  if (merged.parents[0].sha !== base) {
    trackerParent = merged.parents[0].sha;
    const advancement = await api(`${prefix}/compare/${base}...${trackerParent}`);
    if (advancement?.status !== "ahead" || advancement.base_commit?.sha !== base ||
        advancement.merge_base_commit?.sha !== base || !Number.isSafeInteger(advancement.total_commits) ||
        advancement.total_commits < 1 || advancement.total_commits > 20 ||
        !Array.isArray(advancement.commits) || advancement.commits.length !== advancement.total_commits ||
        advancement.commits.at(-1)?.sha !== trackerParent ||
        new Set(advancement.commits.map(value => value.sha)).size !== advancement.total_commits) {
      throw new Error("Incomplete tracker-only main advancement evidence");
    }
    // Check each commit, not only the net diff: reverted runtime changes are not exempt.
    for (const entry of advancement.commits) {
      if (!sha(entry?.sha)) throw new Error("Invalid tracker advancement commit");
      const changed = await api(`${prefix}/commits/${entry.sha}`);
      if (changed?.sha !== entry.sha || !Array.isArray(changed.files) || changed.files.length !== 1 ||
          changed.files[0]?.filename !== "docs/scratch/task_tracker.md" || changed.files[0]?.status !== "modified") {
        throw new Error("Main advancement changed more than the approved task tracker");
      }
    }
  }
  const ancestry = await api(`${prefix}/compare/${commit}...main`);
  if (!["ahead", "identical"].includes(ancestry?.status) || ancestry.base_commit?.sha !== commit ||
      ancestry.merge_base_commit?.sha !== commit) throw new Error("Reviewed release commit is not reachable from main");
  const configs = {};
  for (const revision of [base, head, commit]) {
    configs[revision] = {};
    for (const channel of ["release", "preview"]) {
      const path = channel === "release" ? "config.versions.json" : "config.preview.versions.json";
      const file = await api(`${prefix}/contents/${path}?ref=${revision}`);
      if (file?.type !== "file" || file.path !== path || file.encoding !== "base64" ||
          typeof file.content !== "string" || file.content.length > 32_768 ||
          !/^[A-Za-z0-9+/=\r\n]*$/.test(file.content)) throw new Error("Invalid version config evidence");
      const config = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
      const keys = Object.keys(productDirectories).filter(product => channel !== "release" || product !== "network")
        .map(product => `${channel}-${product}`);
      if (!config || typeof config !== "object" || Array.isArray(config) || Object.keys(config).length !== keys.length ||
          keys.some(key => !Object.hasOwn(config, key) || semver.valid(config[key]) !== config[key] ||
            (channel === "release" && semver.prerelease(config[key]) !== null))) {
        throw new Error("Version config evidence has invalid keys or versions");
      }
      configs[revision][channel] = config;
    }
  }
  const key = `release-${selected.product}`, previous = configs[base].release[key];
  if (semver.inc(previous, "patch") !== selected.version ||
      Object.keys(configs[base].release).some(name => configs[head].release[name] !== (name === key ? selected.version : configs[base].release[name])) ||
      Object.keys(configs[base].preview).some(name => configs[head].preview[name] !== configs[base].preview[name]) ||
      ["release", "preview"].some(channel => Object.keys(configs[head][channel]).some(name => configs[commit][channel][name] !== configs[head][channel][name]))) {
    throw new Error("Reviewed version PR must change only the selected release config patch");
  }
  for (const revision of [head, commit]) {
    const routed = selectTag(tag, configs[revision]);
    if (routed.product !== selected.product || routed.channel !== "release" || routed.version !== selected.version) {
      throw new Error("Reviewed release tag differs from its configs");
    }
  }
  const reviews = await api(`${pull}/reviews?per_page=100`);
  if (!Array.isArray(reviews) || reviews.length >= 100) throw new Error("Review evidence is missing or exceeds its limit");
  const latest = new Map(), ids = new Set();
  for (const review of reviews) {
    if (!Number.isSafeInteger(review?.id) || review.id < 1 || ids.has(review.id) || !review.user?.login ||
        !["APPROVED", "CHANGES_REQUESTED", "DISMISSED", "COMMENTED", "PENDING"].includes(review.state)) throw new Error("Malformed release review evidence");
    ids.add(review.id);
    if (["COMMENTED", "PENDING"].includes(review.state)) continue;
    if (!timestamp(review.submitted_at)) throw new Error("Invalid release review timestamp");
    const old = latest.get(review.user.login.toLowerCase());
    if (!old || Date.parse(old.submitted_at) < Date.parse(review.submitted_at) ||
        (Date.parse(old.submitted_at) === Date.parse(review.submitted_at) && old.id < review.id)) latest.set(review.user.login.toLowerCase(), review);
  }
  if ([...latest.values()].some(review => review.state === "CHANGES_REQUESTED")) throw new Error("Release PR has unresolved requested changes");
  // Owner-selected policy: manual owner inspection and merge replaces a second-person approval.
  // The API proves merge identity, not the human inspection process. Never merge through this executor.
  if (!Array.isArray(prepared.files) || !prepared.files.length || prepared.files.length > 8 ||
      prepared.files.some(file => typeof file?.filename !== "string" || !["modified", "added"].includes(file.status)) ||
      new Set(prepared.files.map(file => file.filename)).size !== prepared.files.length) throw new Error("Invalid prepared metadata file evidence");
  return { repository, commit, tag, prNumber, head, base, previous, version: selected.version,
    preparedFiles: prepared.files.map(file => file.filename), ...(trackerParent ? { trackerParent } : {}) };
}

/** Reproduce metadata with the existing allocator. Never run code from the reviewed tree. */
export async function checkReleaseMetadata(selected, proof, workspace = root, git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, stdio: "pipe" })) {
  const { base, head, commit = head } = proof;
  if (selected?.channel !== "release" || !["package", "crawler", "crawler-client", "worker"].includes(selected.product) ||
      ![base, head, commit].every(value => /^[a-f0-9]{40}$/.test(value ?? ""))) throw new Error("Invalid release metadata identity");
  const paths = ["config.versions.json", "config.preview.versions.json", `${productDirectories[selected.product]}/package.json`,
    ...(selected.product === "package" ? [`${productDirectories.network}/package.json`] : []),
    ...(selected.product === "crawler-client" ? ["src-crawler-client/src-tauri/Cargo.toml", "src-crawler-client/src-tauri/tauri.conf.json"] : [])];
  const text = (revision, path) => {
    const entry = git(workspace, "ls-tree", revision, "--", path).trim();
    if (!/^100644 blob [a-f0-9]{40}\t/.test(entry) || entry.split("\t")[1] !== path) throw new Error("Release metadata must be regular tracked files");
    const value = git(workspace, "show", `${revision}:${path}`);
    if (Buffer.byteLength(value) > 524_288) throw new Error("Release metadata exceeds its size limit");
    return value.replace(/\r\n/g, "\n").trimEnd() + "\n";
  };
  const parent = realpathSync(tmpdir()), directory = mkdtempSync(join(parent, "vrcp-release-metadata-"));
  if (!realpathSync(directory).startsWith(parent + sep)) throw new Error("Unsafe release metadata fixture");
  try {
    const hasChangelog = (() => {
      try {
        const entry = git(workspace, "ls-tree", base, "--", "CHANGELOG.md").trim();
        return /^100644 blob [a-f0-9]{40}\t/.test(entry);
      } catch { return false; }
    })();
    if (hasChangelog) {
      const target = join(directory, "CHANGELOG.md");
      writeFileSync(target, text(base, "CHANGELOG.md"));
    }
    const prior = new Map();
    for (const path of paths) {
      const value = text(base, path);
      prior.set(path, value);
      const target = join(directory, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, value);
    }
    const bumped = await bumpVersion("release", selected.product, "patch", directory);
    if (bumped.version !== selected.version) throw new Error("Release metadata skips the next configured patch");
    await versionFiles("sync", "release", selected.product, directory);
    if (hasChangelog) {
      const { extractProductChangelog } = await import("./changelog.mjs");
      const changelogResult = extractProductChangelog("release", selected.product, bumped.version, directory);
      if (changelogResult?.file) {
        const rel = relative(directory, changelogResult.file).replace(/\\/g, "/");
        paths.push(rel);
      }
    }
    const expected = new Map(paths.map(path => [path, readFileSync(join(directory, path), "utf8").replace(/\r\n/g, "\n").trimEnd() + "\n"]));
    const changed = paths.filter(path => expected.get(path) !== prior.get(path)).sort();
    const actual = git(workspace, "diff", "--name-only", "--no-renames", base, head, "--").trim().split("\n").filter(Boolean).sort();
    if (JSON.stringify(actual) !== JSON.stringify(changed) || (proof.preparedFiles &&
        JSON.stringify([...proof.preparedFiles].sort()) !== JSON.stringify(changed))) throw new Error("Release preparation changes files outside generated metadata");
    for (const path of paths) {
      if (text(head, path) !== expected.get(path)) throw new Error("Release preparation differs from generated metadata");
    }
    if (git(workspace, "rev-parse", `${head}^{tree}`).trim() !== git(workspace, "rev-parse", `${commit}^{tree}`).trim()) {
      const tracker = "docs/scratch/task_tracker.md";
      if (!/^[a-f0-9]{40}$/.test(proof.trackerParent ?? "") ||
          git(workspace, "diff", "--name-status", "--no-renames", head, commit, "--").trim() !== `M\t${tracker}` ||
          text(proof.trackerParent, tracker) !== text(commit, tracker)) {
        throw new Error("Merged release tree differs from the reviewed preparation");
      }
    }
    return { changed, previous: bumped.previous, version: bumped.version };
  } finally {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink() ||
        !realpathSync(directory).startsWith(parent + sep)) throw new Error("Unsafe release metadata cleanup");
    rmSync(directory, { recursive: true });
  }
}

export function readReleaseTagProof(annotation, expected) {
  const boundary = typeof annotation === "string" ? annotation.indexOf("\n\n") : -1;
  if (boundary < 0) throw new Error("Invalid release tag annotation");
  const headers = annotation.slice(0, boundary).split("\n");
  if (!expected || !/^[a-f0-9]{40}$/.test(expected.commit ?? "") || typeof expected.tag !== "string") {
    throw new Error("Missing expected release tag identity");
  }
  for (const [key, value] of Object.entries({ object: expected.commit, type: "commit", tag: expected.tag })) {
    const values = headers.filter(line => line.startsWith(`${key} `));
    if (values.length !== 1 || values[0] !== `${key} ${value}`) throw new Error("Release annotation header differs from the expected tag identity");
  }
  const message = annotation.slice(boundary + 2);
  const trailer = key => {
    const lines = message.split(/\r?\n/).filter(line => line.startsWith(`${key}:`));
    if (lines.length !== 1 || !lines[0].startsWith(`${key}: `)) throw new Error("Missing or duplicated release tag proof trailer");
    return lines[0].slice(key.length + 2);
  };
  const directLines = message.split(/\r?\n/).filter(line => line.startsWith("VRCP-Release-Direct:"));
  if (directLines.length === 1 && directLines[0] === "VRCP-Release-Direct: true") {
    const base = trailer("VRCP-Release-Base");
    if (!/^[a-f0-9]{40}$/.test(base)) throw new Error("Invalid release direct base locator");
    return { direct: true, base, head: expected.commit };
  }
  const pr = trailer("VRCP-Release-PR"), head = trailer("VRCP-Release-Head"), base = trailer("VRCP-Release-Base");
  if (!/^[1-9][0-9]*$/.test(pr) || !Number.isSafeInteger(Number(pr)) || ![head, base].every(value => /^[a-f0-9]{40}$/.test(value))) {
    throw new Error("Invalid release PR locator");
  }
  return { prNumber: Number(pr), head, base };
}

/** Bind an immutable tag to reviewed main metadata, or one exact historical identity. */
export async function checkReleaseSource(selected, source, api = readGitHubAPI(), git = readGit, workspace = root) {
  const { repository, commit, tag, tagObject: expectedTagObject, actor, context } = source;
  const sha = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
  const human = value => value?.type === "User" && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(value.login ?? "");
  if (selected?.channel !== "release" || !Object.hasOwn(releaseWorkflows, selected?.product ?? "") ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !sha(commit) ||
      (expectedTagObject !== undefined && !sha(expectedTagObject)) || (actor !== undefined && !human(actor)) ||
      semver.valid(selected.version) !== selected.version || semver.prerelease(selected.version) !== null ||
      ![`${productTagPrefixes[selected.product]}/v${selected.version}`, `${selected.product}/v${selected.version}`].includes(tag)) {
    throw new Error("Invalid release source identity or non-human release actor");
  }
  if (selected.product === "package") checkSDKPublicationVersion(selected.version);
  if (context && (context.event !== "push" || context.head_branch !== tag || context.head_sha !== commit ||
      context.head_repository?.full_name !== repository || context.path !== `.github/workflows/${releaseWorkflows[selected.product]}.yml` ||
      !human(context.actor) || (actor !== undefined && (context.actor.login !== actor.login || context.actor.type !== actor.type)))) {
    throw new Error("Release source differs from the original product tag-push run");
  }
  const ref = `refs/tags/${tag}`;
  const tagObject = git(workspace, "rev-parse", "--verify", ref).trim();
  if (!sha(tagObject) || (expectedTagObject && expectedTagObject !== tagObject) ||
      git(workspace, "cat-file", "-t", tagObject).trim() !== "tag" ||
      git(workspace, "rev-parse", "--verify", `${ref}^{commit}`).trim() !== commit) {
    throw new Error("Release requires the exact local annotated tag and source commit");
  }
  const { checkRemoteTag } = await import("./release-assets.mjs");
  let remoteAnnotation;
  await checkRemoteTag(async (method, path) => {
    if (method !== "GET") throw new Error("Release proof permits only metadata reads");
    const value = await api(path);
    if (path.includes("/git/ref/tags/") && value?.object?.type !== "tag") throw new Error("Release requires an annotated remote tag");
    if (path === `/repos/${repository}/git/tags/${tagObject}`) remoteAnnotation = value;
    return value;
  }, repository, tag, commit, tagObject);
  const baselinePath = join(workspace, ".github/release-baseline.json");
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    if (baseline?.schemaVersion !== 1 || typeof baseline.repository !== "string" ||
        !baseline.tags || typeof baseline.tags !== "object" || Array.isArray(baseline.tags)) throw new Error("Invalid immutable release baseline");
    const identity = Object.hasOwn(baseline.tags, tag) ? baseline.tags[tag] : undefined;
    if (baseline.repository === repository && identity?.tagObject === tagObject && identity.commit === commit) {
      return { repository, commit, tag, tagObject, baseline: true };
    }
  }
  if (tag !== `${productTagPrefixes[selected.product]}/v${selected.version}`) throw new Error("Historical release tag has no exact baseline identity");
  const annotation = git(workspace, "cat-file", "-p", tagObject);
  const tagProof = readReleaseTagProof(annotation, { tag, commit });
  if (remoteAnnotation?.object?.type !== "commit" ||
      remoteAnnotation.object.sha !== commit || remoteAnnotation.tag !== tag) throw new Error("Invalid release tag annotation");
  if (tagProof.direct) {
    const owner = repository.split("/")[0].toLowerCase();
    const releaseActor = actor ?? context?.actor;
    if (!human(releaseActor) || releaseActor.login.toLowerCase() !== owner) {
      throw new Error("Direct release requires repository owner actor");
    }
    const proof = { repository, commit, tag, head: commit, base: tagProof.base, direct: true };
    const metadata = await checkReleaseMetadata(selected, proof, workspace, git);
    return { ...proof, tagObject, metadata, baseline: false };
  }
  const proof = await checkReviewedRelease(selected, { repository, commit, tag, ...tagProof, actor: actor ?? context?.actor }, api);
  const metadata = await checkReleaseMetadata(selected, proof, workspace, git);
  return { ...proof, tagObject, metadata, baseline: false };
}

export function workerSecretBindings(env) {
  if (!/^[a-f0-9]{64}$/i.test(env.OPERATOR_TOKEN ?? "")) {
    throw new Error("CI preview deployment requires an environment-scoped 64-hex OPERATOR_TOKEN secret");
  }
  return { OPERATOR_TOKEN: env.OPERATOR_TOKEN };
}

export function validateCIArtifact(receipt, expected, bytes) {
  if (!/^[a-f0-9]{40}$/.test(expected.commit ?? "") || receipt?.purpose !== "ci-release" ||
      !Object.entries(expected).every(([key, value]) => receipt[key] === value) ||
      receipt.sha256 !== createHash("sha256").update(bytes).digest("hex")) {
    throw new Error("CI artifact differs from its checked identity, configuration, commit or digest");
  }
}

export function validateSDKStage(stage, expected, bytes) {
  if (!Object.values(sdkPackageNames).includes(expected.name) ||
      typeof stage?.id !== "string" || stage.id.length !== 36 ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stage.id) ||
      stage.packageName !== expected.name || stage.version !== expected.version || stage.tag !== "latest" ||
      stage.shasum !== createHash("sha1").update(bytes).digest("hex")) {
    throw new Error("npm stage identity, tag or tarball checksum differs from the checked SDK");
  }
  return stage.id;
}

export function stageSDKArtifact(artifact, expected, receipt, run) {
  const project = dirname(artifact);
  const bytes = readFileSync(artifact);
  validateCIArtifact(receipt, expected, bytes);
  if (semver.lt(run(["--version"], project, true).trim(), "11.15.0")) throw new Error("npm staging requires CLI 11.15.0 or later");
  const registry = "--registry=https://registry.npmjs.org";
  const stages = JSON.parse(run(["stage", "list", expected.name, "--json", registry], project, true));
  if (!Array.isArray(stages) || stages.some(stage => !stage || typeof stage !== "object")) {
    throw new Error("npm pending-stage list is malformed");
  }
  const matches = stages.filter(stage => stage.packageName === expected.name && stage.version === expected.version);
  if (matches.length > 1) throw new Error("Multiple npm stages claim the configured SDK version");
  let stageId;
  if (matches.length === 1) {
    stageId = validateSDKStage(matches[0], expected, bytes);
  } else {
    const result = JSON.parse(run(["stage", "publish", artifact, "--access", "public", "--tag", "latest",
      "--ignore-scripts", "--json", registry], project, true))[expected.name];
    stageId = validateSDKStage({ id: result?.stageId, packageName: result?.name, version: result?.version,
      tag: "latest", shasum: result?.shasum }, expected, bytes);
  }
  validateSDKStage(JSON.parse(run(["stage", "view", stageId, "--json", registry], project, true)), expected, bytes);
  console.log(JSON.stringify({ name: expected.name, version: expected.version, stageId, status: "staged-unverified" }));
  const stageDirectory = mkdtempSync(join(tmpdir(), "vrcp-sdk-stage-"));
  const stagedArtifact = join(stageDirectory, `${expected.name}-${expected.version}-${stageId}.tgz`);
  try {
    run(["stage", "download", stageId, "--json", registry], stageDirectory, true);
    validateCIArtifact(receipt, expected, readFileSync(stagedArtifact));
  } finally {
    if (existsSync(stagedArtifact)) unlinkSync(stagedArtifact);
    rmdirSync(stageDirectory);
  }
  return { ...expected, stageId, tag: "latest", sha256: receipt.sha256, status: "awaiting-npm-approval", purpose: "npm-stage" };
}

async function readPublicSDK(name, version, signal) {
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, {
    redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    headers: { accept: "application/json", "cache-control": "no-cache" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry check failed (${response.status}). No publication retry ran.`);
  return response.json();
}

/** Preview is directly published through OIDC. Releases still use owner-approved stages. */
export async function publishPreviewSDKArtifact(artifact, expected, receipt, run, registry = readPublicSDK,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  // The SDK project .npmrc is for token-backed staging. Its empty token would
  // shadow the user-level credential installed by npm's OIDC exchange.
  const bytes = readFileSync(artifact), project = root;
  validateCIArtifact(receipt, expected, bytes);
  if (expected.name !== sdkPackageNames.preview) throw new Error("Direct publication is preview-only");
  checkSDKPublicationVersion(expected.version, "preview", expected.name);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const check = metadata => {
    if (metadata?.name !== expected.name || metadata.version !== expected.version || metadata.dist?.integrity !== integrity) {
      throw new Error("Public preview SDK differs from its checked artifact");
    }
  };
  const existing = await registry(expected.name, expected.version);
  if (existing) check(existing);
  const latest = await registry(expected.name, "latest");
  if (latest && (latest.name !== expected.name || !semver.valid(latest.version) || semver.gt(latest.version, expected.version))) {
    throw new Error("Preview latest would roll back or has invalid identity");
  }
  if (!existing) {
    if (semver.lt(run(["--version"], project, true).trim(), "11.19.0")) throw new Error("Preview OIDC publication requires CLI 11.19.0 or later");
    // Do not approve stages, change dist-tags on retries, or fall back to a write token.
    run(["publish", artifact, "--access", "public", "--tag", "latest", "--ignore-scripts",
      "--json", "--registry=https://registry.npmjs.org"], project, true);
  }
  // npm can acknowledge publication before its public version and alias reads converge.
  // Retry reads only. Different bytes or identity fail immediately, with no second publish.
  const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000], signal = AbortSignal.timeout(90_000);
  for (let attempt = 0;; attempt++) {
    signal.throwIfAborted();
    const published = await registry(expected.name, expected.version, signal);
    if (published !== null) check(published);
    const alias = await registry(expected.name, "latest", signal);
    const olderAlias = alias?.name === expected.name && semver.valid(alias.version) && semver.lt(alias.version, expected.version);
    if (alias !== null && !olderAlias) check(alias);
    if (published !== null && alias !== null && !olderAlias) break;
    if (attempt === delays.length) throw new Error("Preview publication readback did not converge. No publication retry ran.");
    await wait(delays[attempt]);
  }
  return { ...expected, channel: "preview", tag: "latest", sha256: receipt.sha256, integrity,
    status: "published-verified", purpose: "npm-publication" };
}

export async function resolveTag(tag, workspace = root, historical = false) {
  const configs = Object.fromEntries(await Promise.all(["release", "preview"].map(async channel =>
    [channel, historical ? JSON.parse(readFileSync(resolve(workspace,
      channel === "release" ? "config.versions.json" : "config.preview.versions.json"), "utf8"))
      : (await readVersionConfig(channel, workspace)).config])));
  return selectTag(tag, configs, historical);
}

export function selectTag(tag, configs, historical = false) {
  if (typeof tag !== "string" || tag.trim() !== tag) throw new Error("Tag must be an exact canonical string");
  const match = /^([a-z-]+)\/v(.+)$/.exec(tag);
  const product = match && Object.keys(productTagPrefixes).find(key =>
    productTagPrefixes[key] === match[1] || (historical && key === match[1]));
  if (!product || semver.valid(match[2]) !== match[2]) throw new Error("Expected a product-specific prefix and canonical version tag");
  const version = match[2];
  const matches = [];
  for (const channel of ["release", "preview"]) {
    if (product === "network" && channel === "release" && !historical) continue;
    if (configs[channel]?.[`${channel}-${product}`] === version) matches.push(channel);
  }
  if (matches.length !== 1) throw new Error("Tag must match exactly one version config. Equal channel values need an explicit channel-tag decision.");
  const channel = matches[0];
  const environment = product === "package"
    ? channel === "preview" ? "vrcp-api-preview" : "vrcp-api-release"
    : product === "worker" && channel === "preview" ? "cloudflare-preview"
    : channel === "preview" ? "preview" : "production";
  return { product, version, channel, environment };
}

export async function requireCI(product, channel, env = process.env, workspace = root, api = readGitHubAPI(env), git = readGit) {
  if (env.VRCP_RECOVERY_TAG) {
    await requireRecoveryCI(product, channel, env, workspace, api, git);
    const selected = await resolveTag(env.VRCP_RECOVERY_TAG, workspace);
    if (selected.product !== product || selected.channel !== channel) throw new Error("Recovery selects another product/channel.");
    return selected;
  }
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "push" ||
      !env.GITHUB_REF?.startsWith(`refs/tags/${productTagPrefixes[product]}/v`) || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("Release artifacts and remote actions require a matching GitHub tag-push job. Local output is development-only.");
  }
  const tag = env.GITHUB_REF.slice("refs/tags/".length);
  const selected = await resolveTag(tag, workspace);
  if (selected.product !== product || selected.channel !== channel) throw new Error("CI tag selects another product/channel");
  if (channel === "release") {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? "")) {
      throw new Error("Release CI requires repository and original Actions run identity");
    }
    const run = await api(`/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`);
    if (String(run?.id) !== env.GITHUB_RUN_ID) throw new Error("Release source Actions run identity differs");
    await checkReleaseSource(selected, { repository: env.GITHUB_REPOSITORY, commit: env.GITHUB_SHA, tag,
      actor: run.actor, context: run }, api, git, workspace);
  }
  return selected;
}

/** Keep npm's auth diagnostics useful without forwarding raw logs or credentials. */
export function previewOIDCFailure(stderr) {
  const log = String(stderr ?? "");
  const exchange = log.split("\n").filter(line => line.includes("http fetch POST") &&
    line.includes("https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/"));
  const statuses = exchange.map(line => /\bPOST(?:\s+https:\/\/\S+)?\s+([1-5][0-9]{2})\b/.exec(line)?.[1])
    .filter(Boolean).slice(-8).map(Number);
  return { action: "preview-npm-auth-failure", exchangeStatuses: statuses,
    tokenInstalled: log.includes("oidc Successfully retrieved and set token"),
    exchangeRejected: log.includes("oidc Failed token exchange request"),
    oidcException: log.includes("oidc Failure with message"),
    noCredentials: /\bENEEDAUTH\b/.test(log) };
}

function packageCommand(args, cwd, capture = false) {
  // Bun owns installs and package scripts. npm remains the checked registry/staging interface.
  if (["install", "run"].includes(args[0])) {
    return execFileSync("bun", args, { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  }
  const cli = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")]
    .find(path => path?.endsWith("npm-cli.js") && existsSync(path));
  if (!cli) throw new Error("Registry checks require a Node installation that includes npm. Use Bun for project scripts.");
  const diagnose = capture && args[0] === "publish";
  try {
    return execFileSync(process.execPath, [cli, ...args, ...(diagnose ? ["--loglevel=verbose"] : [])],
      { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  } catch (error) {
    if (!diagnose) throw error;
    console.error(JSON.stringify(previewOIDCFailure(error.stderr)));
    throw new Error("Preview npm publication failed. Read its sanitized authentication summary.");
  }
}

function inspectDependencies(project, latestVersion) {
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  for (const name of Object.keys(artifacts)) {
    const peer = manifest.peerDependencies?.[name];
    const expected = manifest.dependencies?.[name] ?? (peer ? manifest.devDependencies?.[name] : undefined);
    if (peer && !expected) throw new Error(`${name} peer requires an explicit development dependency for package verification`);
    if (!expected) continue;
    const artifact = distributedArtifact(name, expected, latestVersion);
    const path = join(project, "node_modules", name);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(realpathSync(project) + sep)) {
      throw new Error(`${name} requires an installed artifact, not a sibling/workspace link. Run delivery prepare first.`);
    }
    const installed = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (installed.name !== artifact.name || installed.version !== artifact.version) throw new Error(`${name} installed identity/version differs from its declared artifact`);
    if (peer && !semver.satisfies(installed.version, peer)) throw new Error(`${name} installed version falls outside the checked peer contract`);
    if (name === "vrc-packages-network" && (installed.dependencies?.["vrc-packages-api"] ||
        !semver.satisfies(latestVersion, installed.peerDependencies?.["vrc-packages-api"] ?? ""))) {
      throw new Error("Installed network archive does not accept the consumer's SDK channel");
    }
  }
}

/** Produce product-local development artifacts or CI-only release artifacts. Never tag or push. */
export async function deliver(action, channel, product, ci = false, skipTests = false) {
  if (product === "network" && channel === "release") throw new Error("Network has one rapid stream; use preview network");
  if (!["prepare", "build", "pack", "verify", "deploy", "publish"].includes(action) ||
      !["release", "preview"].includes(channel) || !Object.hasOwn(productDirectories, product)) {
    throw new Error("Usage: delivery.mjs <prepare|build|pack|verify|deploy|publish> <release|preview> <product> [--ci] [--skip-tests]");
  }
  const skipTestsRequested = Boolean(
    skipTests ||
    process.env.VRCP_SKIP_TESTS === "true" ||
    process.env.VRCP_SKIP_TESTS === "1"
  );
  if (skipTestsRequested && channel === "release") {
    throw new Error("Tests cannot be disabled on release/production routes");
  }
  if (["deploy", "publish"].includes(action) && !ci) throw new Error("Remote actions are CI-only");
  if (action === "deploy" && product !== "worker") throw new Error("Only Worker deployment is configured. Web hosting remains owner-selected.");
  if (action === "publish" && product !== "package") throw new Error("Only SDK npm publication is conditionally authorized. Internal registry remains undecided.");
  if (["pack", "verify"].includes(action) && !["package", "network"].includes(product)) throw new Error("Pack/verify applies only to distributed packages");
  if (ci) await requireCI(product, channel);
  await versionFiles("check", channel, product);
  const sdkChannel = sdkChannelForProduct(product, channel);
  const { config: sdkConfig } = await readVersionConfig(sdkChannel);
  const sdkVersion = sdkConfig[`${sdkChannel}-package`];
  const project = resolve(root, productDirectories[product]);
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));

  if (action === "prepare") {
    const inputs = [];
    const needsNetwork = !!manifest.dependencies?.["vrc-packages-network"];
    const needsSDK = product === "network" || !!manifest.dependencies?.["vrc-packages-api"];
    if (needsSDK) inputs.push(`vrc-packages-api@file:${packRegistrySDK(resolve(root, productDirectories.package), sdkChannel, sdkVersion)}`);
    if (needsNetwork) {
      if (!needsSDK) throw new Error("Network consumers must declare their selected SDK dependency");
      const { readNetworkDistribution } = await import("./delivery-chain.mjs");
      const { config: networkConfig } = await readVersionConfig("preview");
      const version = networkConfig["preview-network"];
      const downloaded = await readNetworkDistribution(version);
      const destination = resolve(root, productDirectories.network, ".artifacts/dev");
      mkdirSync(destination, { recursive: true });
      const artifact = join(destination, `vrc-packages-network-${version}.tgz`);
      writeFileSync(artifact, downloaded.bytes);
      writeFileSync(`${artifact}.json`, JSON.stringify(downloaded.receipt, null, 2) + "\n");
      writeFileSync(`${artifact}.dependency.json`, JSON.stringify({ purpose: "hosted-development-dependency",
        version, url: downloaded.url, sourceRun: downloaded.sourceRun, tag: downloaded.tag, tagObject: downloaded.tagObject,
        sha256: downloaded.receipt.sha256 }, null, 2) + "\n");
      inputs.push(`vrc-packages-network@file:${artifact}`);
    }
    // These are packed JS/type dependencies. No sibling source is read by a consumer build.
    packageCommand(["install", "--no-save", "--ignore-scripts", ...inputs], project);
    inspectDependencies(project, sdkVersion);
    if (needsNetwork) execFileSync(process.execPath, ["--input-type=module", "-e",
      "import { NodeIdSchema } from 'vrc-packages-network/node'; import { IssueNodeCredentialSchema } from 'vrc-packages-api'; if (NodeIdSchema !== IssueNodeCredentialSchema.shape.nodeId) throw new Error('Network resolved another SDK');"],
      { cwd: project, stdio: "inherit", timeout: 30_000 });
  } else {
    if (!["deploy", "publish"].includes(action)) inspectDependencies(project, sdkVersion);
    if (action === "build") {
      if (product === "worker") {
        packageCommand(["run", `build:${channel}`], project);
        if (ci) {
          const bundle = join(project, ".wrangler/dev-build", channel === "preview" ? "preview" : "production", "worker_entry.js");
          writeFileSync(`${bundle}.json`, JSON.stringify({ purpose: "ci-release", product,
            name: manifest.name, version: manifest.version, channel, commit: process.env.GITHUB_SHA,
            configSha256: createHash("sha256").update(readFileSync(join(project, "wrangler.toml"))).digest("hex"),
            sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex") }, null, 2) + "\n");
        }
      }
      else if (product === "crawler") packageCommand(["run", process.platform === "win32" ? "build:dev" : "build:node:linux"], project);
      else if (product === "crawler-client" && !ci) packageCommand(["run", "build:dev"], project);
      else packageCommand(["run", "build"], project);
    } else if (action === "pack") {
      packageCommand(["run", "build"], project);
      console.log(JSON.stringify({ artifact: pack(project, ci), purpose: ci ? "ci-release" : "development" }));
    } else if (action === "verify") {
      const runTest = (cmd, cwd) => {
        try {
          packageCommand(cmd, cwd);
        } catch (error) {
          if (channel === "preview") {
            console.warn(`::warning::Preview test failure ignored (${cmd.join(" ")}): ${error instanceof Error ? error.message : error}`);
          } else {
            throw error;
          }
        }
      };
      if (!skipTestsRequested) {
        if (product === "package") runTest(["run", "test"], project);
      }
      packageCommand(["run", "typecheck"], project);
      if (product === "network") {
        // Pack once. Both SDK channels must consume these same network bytes.
        packageCommand(["run", "build"], project);
        const network = pack(project, false);
        if (!skipTestsRequested) {
          for (const sdkChannel of ["release", "preview"]) {
            const sdkConfig = (await readVersionConfig(sdkChannel)).config;
            const sdk = packRegistrySDK(resolve(root, productDirectories.package), sdkChannel, sdkConfig[`${sdkChannel}-package`]);
            runTest(["run", "test:distribution", "--sdk-tarball", sdk, "--network-tarball", network], project);
          }
        }
      } else if (!skipTestsRequested) runTest(["run", "test:distribution"], project);
    } else if (action === "deploy") {
      if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) throw new Error("CI requires protected Cloudflare account/token secrets");
      const directory = channel === "preview" ? "preview" : "production";
      const bundle = join(project, ".wrangler/dev-build", directory, "worker_entry.js");
      const cli = join(project, ".wrangler/ci-tools/node_modules/wrangler/bin/wrangler.js");
      if (!existsSync(bundle) || !existsSync(cli)) throw new Error("Deploy requires the CI-verified bundle and pinned Wrangler tools. It does not rebuild source.");
      validateCIArtifact(JSON.parse(readFileSync(`${bundle}.json`, "utf8")), {
        product, name: manifest.name, version: manifest.version, channel, commit: process.env.GITHUB_SHA,
        configSha256: createHash("sha256").update(readFileSync(join(project, "wrangler.toml"))).digest("hex")
      }, readFileSync(bundle));
      const bindings = workerSecretBindings(process.env);
      const secretDirectory = mkdtempSync(join(tmpdir(), "vrcp-worker-deploy-"));
      const secretPath = join(secretDirectory, "secrets.json");
      try {
        writeFileSync(secretPath, JSON.stringify(bindings), { flag: "wx", mode: 0o600 });
        execFileSync(process.execPath, [cli, "deploy", bundle, "--no-bundle", "--autoconfig=false",
          "--env", channel === "preview" ? "preview" : "", "--config", "wrangler.toml",
          "--secrets-file", secretPath], { cwd: project, stdio: "inherit" });
      } finally {
        if (existsSync(secretPath)) unlinkSync(secretPath);
        rmdirSync(secretDirectory);
      }
    } else if (action === "publish") {
      checkSDKPublicationVersion(manifest.version, channel, manifest.name);
      if (manifest.private) throw new Error("SDK remains private until its package gate passes. Do not publish by bypassing this hold.");
      const artifact = join(project, ".artifacts/ci", `${manifest.name}-${manifest.version}.tgz`);
      const receipt = JSON.parse(readFileSync(`${artifact}.json`, "utf8"));
      const expected = { name: manifest.name, version: manifest.version, commit: process.env.GITHUB_SHA };
      if (channel === "preview") {
        if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN ||
            process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) {
          throw new Error("Direct preview publication requires OIDC without npm write tokens");
        }
        const publication = await publishPreviewSDKArtifact(artifact, expected, receipt, packageCommand);
        writeFileSync(`${artifact}.published.json`, JSON.stringify(publication, null, 2) + "\n");
        return { action, channel, product, purpose: "ci-release", status: publication.status };
      }
      const stage = stageSDKArtifact(artifact, expected, receipt, packageCommand);
      writeFileSync(`${artifact}.stage.json`, JSON.stringify({ ...stage, channel }, null, 2) + "\n");
      return { action, channel, product, purpose: "ci-release", status: stage.status, stageId: stage.stageId };
    }
  }
  return { action, channel, product, purpose: ci ? "ci-release" : "development" };
}

export function validateRegistrySDK(result, metadata, expected, bytes, name = sdkPackageNames.release) {
  if (!Object.values(sdkPackageNames).includes(name) || metadata.name !== name || metadata.version !== expected ||
      result.name !== metadata.name || result.version !== expected ||
      result.filename !== `${name}-${expected}.tgz` ||
      !metadata.dist?.integrity || result.integrity !== metadata.dist.integrity ||
      result.integrity !== `sha512-${createHash("sha512").update(bytes).digest("base64")}` ||
      !result.files.every(file => ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file.path) ||
        /^dist\/.*\.(js|d\.ts)$/.test(file.path))) {
    throw new Error("Registry SDK identity, integrity or distribution contents differ from the configured artifact");
  }
}

function packRegistrySDK(project, channel, configuredVersion) {
  const name = sdkPackageNames[channel];
  const version = configuredVersion ?? JSON.parse(readFileSync(join(project, "package.json"), "utf8")).version;
  const registry = "https://registry.npmjs.org";
  // Recovery must use the tag's saved dependency, not a newer moving registry alias.
  const spec = process.env.VRCP_RECOVERY_TAG ? `${name}@${version}` : `${name}@latest`;
  const metadata = JSON.parse(packageCommand(["view", spec, "--json", `--registry=${registry}`], root, true));
  if (metadata.name !== sdkPackageNames[channel] || metadata.version !== version) {
    throw new Error("Registry SDK channel resolves outside the authoritative version config");
  }
  const destination = join(project, ".artifacts/dev");
  mkdirSync(destination, { recursive: true });
  const [result] = JSON.parse(packageCommand(["pack", `${name}@${version}`, "--ignore-scripts", "--json", `--registry=${registry}`,
    "--pack-destination", destination], root, true));
  const artifact = join(destination, `${name}-${version}.tgz`);
  const bytes = readFileSync(artifact);
  validateRegistrySDK(result, metadata, version, bytes, name);
  writeFileSync(`${artifact}.json`, JSON.stringify({ name: result.name, version, integrity: result.integrity,
    sha256: createHash("sha256").update(bytes).digest("hex"), purpose: "registry-dependency", registry }, null, 2) + "\n");
  console.log(JSON.stringify({ name: result.name, version, integrity: result.integrity, source: registry }));
  return artifact;
}

function pack(project, ci) {
  const destination = join(project, ".artifacts", ci ? "ci" : "dev");
  mkdirSync(destination, { recursive: true });
  const [result] = JSON.parse(packageCommand(["pack", "--ignore-scripts", "--json", "--pack-destination", destination], project, true));
  const expected = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  if (result.name !== expected.name || result.version !== expected.version ||
      !result.files.every(file => ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file.path) ||
        /^dist\/.*\.(js|d\.ts)$/.test(file.path))) throw new Error("Packed artifact contains unexpected identity or files");
  console.log(JSON.stringify({ name: result.name, version: result.version, integrity: result.integrity, purpose: ci ? "ci-release" : "development" }));
  const artifact = join(destination, result.filename);
  writeFileSync(`${artifact}.json`, JSON.stringify({ name: result.name, version: result.version,
    integrity: result.integrity, sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
    purpose: ci ? "ci-release" : "development", commit: ci ? ciSourceCommit() : null,
    ...(ci && process.env.VRCP_RECOVERY_TAG ? { recovery: { toolingCommit: process.env.GITHUB_SHA,
      sourceRun: Number(process.env.GITHUB_RUN_ID), failedRun: recoveryIdentity(process.env.VRCP_RECOVERY_TAG).failedRun } } : {}) }, null, 2) + "\n");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Finish module evaluation before preparation imports the chain, which imports this module.
  void (async () => {
  const [action, channel, product, flag, ...extra] = process.argv.slice(2);
  try {
    if (action === "tag") {
      if (product || flag || extra.length) throw new Error("Tag command takes exactly one tag");
      const selected = await resolveTag(channel);
      if (selected.channel === "release" && (process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_OUTPUT)) {
        if (!process.env.VRCP_RECOVERY_TAG && process.env.GITHUB_REF !== `refs/tags/${channel}`) throw new Error("CI routing tag differs from the original push ref");
        await requireCI(selected.product, selected.channel);
      }
      console.log(JSON.stringify(selected));
      if (process.env.GITHUB_OUTPUT) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selected).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
        appendFileSync(process.env.GITHUB_OUTPUT, `commit=${ciSourceCommit()}\n`);
      }
    } else {
      const allFlags = [flag, ...extra].filter(Boolean);
      const ci = allFlags.includes("--ci");
      const skipTests = allFlags.includes("--skip-tests");
      const unknownFlags = allFlags.filter(arg => arg !== "--ci" && arg !== "--skip-tests");
      if (unknownFlags.length) throw new Error("Only --ci and --skip-tests are accepted after the product");
      console.log(JSON.stringify(await deliver(action, channel, product, ci, skipTests)));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Delivery command failed");
    process.exitCode = 1;
  }
  })();
}
