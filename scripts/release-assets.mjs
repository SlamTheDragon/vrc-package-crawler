import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { requireCI, resolveTag, validateCIArtifact } from "./delivery.mjs";
import { productDirectories, sdkPackageNames } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const workflowNames = { package: "vrc-packages-api", network: "network",
  crawler: "node-docker", "crawler-client": "node-client", web: "web" };

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Release inputs cannot contain symlinks");
    if (entry.isDirectory()) return filesIn(path);
    if (!entry.isFile()) throw new Error("Release inputs must be regular files");
    return [path];
  });
}

export function allowedBinary(name, product, version) {
  if (product === "crawler") return /^vrcp-crawler-node(?:-linux|\.exe)$/.test(name);
  if (product === "crawler-client") return /^[A-Za-z0-9_. -]+(?:\.msi|-setup\.exe)$/.test(name);
  return product === "web" && name === `vrcp-web-${version}.tgz`;
}

/** Check every downloaded file. No unlisted file can become a release asset. */
export function checkedAssets(paths, selected, commit, manifest) {
  if (selected.product === "worker") throw new Error("Worker bundles are CI-only, not GitHub Release assets");
  const files = new Map();
  for (const path of paths) {
    const name = basename(path);
    if (files.has(name)) throw new Error("Duplicate release asset name");
    files.set(name, readFileSync(path));
  }
  const { product, version, channel } = selected;
  const used = new Set();
  const get = name => {
    if (!files.has(name)) throw new Error(`Missing checked release asset: ${name}`);
    used.add(name);
    return files.get(name);
  };
  if (["package", "network"].includes(product)) {
    const name = product === "package" ? sdkPackageNames[channel] : manifest.name;
    const asset = `${name}-${version}.tgz`;
    const receipt = JSON.parse(get(`${asset}.json`));
    const expected = { name, version, commit };
    validateCIArtifact(receipt, expected, get(asset));
    if (product === "package" && files.has(`${asset}.stage.json`)) {
      const stage = JSON.parse(get(`${asset}.stage.json`));
      if (stage.name !== name || stage.version !== version || stage.commit !== commit || stage.channel !== channel ||
          stage.sha256 !== hash(get(asset)) || stage.purpose !== "npm-stage" || stage.tag !== "latest" ||
          stage.status !== "awaiting-npm-approval" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(stage.stageId ?? "")) {
        throw new Error("SDK stage receipt differs from the checked artifact");
      }
    }
  } else {
    const receiptNames = product === "crawler" ? ["crawler-linux.receipt.json", "crawler-windows.receipt.json"] : [`${product}.receipt.json`];
    for (const receiptName of receiptNames) {
      const receipt = JSON.parse(get(receiptName));
      if (receipt.product !== product || receipt.version !== version || receipt.channel !== channel ||
          receipt.commit !== commit || receipt.purpose !== "ci-release" || !Array.isArray(receipt.files) ||
          receipt.files.length < 1 || receipt.files.length > 2) throw new Error("Invalid binary release receipt");
      for (const file of receipt.files) {
        if (!allowedBinary(file.name, product, version) || used.has(file.name)) throw new Error("Unexpected binary asset");
        if (product === "crawler" && file.name !== (receiptName.includes("linux") ? "vrcp-crawler-node-linux" : "vrcp-crawler-node.exe")) {
          throw new Error("Binary platform differs from its receipt");
        }
        const bytes = get(file.name);
        if (file.size !== bytes.length || file.sha256 !== hash(bytes)) throw new Error("Binary bytes differ from receipt");
      }
    }
  }
  if (used.size !== files.size) throw new Error("Unexpected file in release artifacts");
  return files;
}

export function milestoneNotes(markdown, product, selected, commit, runURL, status) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const start = lines.findIndex(line => line === `## ${product}`);
  if (start < 0) throw new Error("Missing product milestone changelog");
  let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end).join("\n").trim();
  if (!section || section.length > 6000) throw new Error("Product milestone notes must be nonempty and bounded");
  return `# VRC Packages - ${product} ${selected.version}\n\nChannel: ${selected.channel}. Delivery: ${status}.\nCommit: ${commit}.\n[Checked CI run](${runURL})\n\n${section}\n\nAssets include checked build outputs and SHA-256 checksums.\n`;
}

export function checkSourceRun(run, jobs, tag, repository, product) {
  if (product === "worker") throw new Error("Worker bundles are CI-only, not GitHub Release assets");
  const workflow = workflowNames[product];
  const required = product === "crawler" ? [tag.startsWith("crawler/v") ? "build-and-push" : "build-linux", "standalone-windows"] : ["build"];
  if (run.event !== "push" || run.head_branch !== tag || !/^[a-f0-9]{40}$/.test(run.head_sha ?? "") ||
      run.head_repository?.full_name !== repository || run.path !== `.github/workflows/${workflow}.yml` ||
      required.some(name => !jobs.some(job => job.name === name && job.status === "completed" && job.conclusion === "success")) ||
      (product === "crawler" && !tag.startsWith("crawler/v") && !jobs.some(job => job.name === "publish-container" &&
        job.status === "completed" && ["success", "skipped"].includes(job.conclusion)))) {
    throw new Error("Release source is not the checked product-tag build");
  }
}

/** Published assets are immutable here. Retry only missing uploads or an unfinished draft. */
export async function attachRelease(api, repository, tag, commit, notes, files, draft, prerelease) {
  const base = `/repos/${repository}/releases`;
  let release = await api("GET", `${base}/tags/${encodeURIComponent(tag)}`, undefined, true);
  // Some tag lookups omit drafts. Find an unfinished draft before creating another one.
  if (!release) {
    for (let page = 1; page <= 10; page++) {
      const releases = await api("GET", `${base}?per_page=100&page=${page}`);
      if (!Array.isArray(releases)) throw new Error("Invalid release listing");
      release = releases.find(item => item.tag_name === tag);
      if (release || releases.length < 100) break;
      if (page === 10) throw new Error("Release lookup exceeded its bound");
    }
  }
  // The caller already checked the existing tag. Do not create or retarget a tag through this endpoint.
  if (!release) release = await api("POST", base, { tag_name: tag,
    name: `VRC Packages - ${tag}`, body: notes, draft: true, prerelease, make_latest: "false" });
  if (release.tag_name !== tag || (release.prerelease !== prerelease)) throw new Error("Existing release channel differs");
  const existing = await api("GET", `${base}/${release.id}/assets?per_page=100`);
  if (!Array.isArray(existing) || existing.length >= 100 || existing.some(asset => !files.has(asset.name))) {
    throw new Error("Unexpected existing release assets");
  }
  if (existing.some(asset => asset.name === "CHANGELOG.md") && release.body?.includes("\nCurrent delivery status: ")) {
    // Notes belong to the first attachment, not moving main. Retain checked historical bytes on promotion/retry.
    const hasChecksums = existing.some(asset => asset.name === "CHECKSUMS.sha256");
    if (!hasChecksums && !release.draft) throw new Error("Published release checksum asset is missing");
    for (const name of hasChecksums ? ["CHANGELOG.md", "CHECKSUMS.sha256"] : ["CHANGELOG.md"]) {
      const asset = existing.find(item => item.name === name);
      if (!asset || asset.size > 16_384) throw new Error("Missing or oversized attached release notes");
      const bytes = await api("DOWNLOAD", `${base}/assets/${asset.id}`);
      if (bytes.length !== asset.size || `sha256:${hash(bytes)}` !== asset.digest) throw new Error("Attached notes differ from their digest");
      files.set(name, bytes);
    }
    if (!hasChecksums) files.set("CHECKSUMS.sha256", Buffer.from([...files].filter(([name]) => name !== "CHECKSUMS.sha256")
      .map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n"));
    const stored = files.get("CHANGELOG.md").toString("utf8");
    const link = /\[Checked CI run\]\([^)]+\)/.exec(notes)?.[0];
    if (!link || !stored.includes(link) || !stored.includes(`Commit: ${commit}.\n`) ||
        !stored.includes(`Channel: ${prerelease ? "preview" : "release"}.`) ||
        !stored.split("\n")[0].endsWith(` ${tag.split("/v")[1]}`)) throw new Error("Attached notes identify another delivery");
    const covered = new Set();
    for (const line of files.get("CHECKSUMS.sha256").toString("utf8").trimEnd().split("\n")) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      if (!match || match[2] === "CHECKSUMS.sha256" || covered.has(match[2]) || !files.has(match[2]) ||
          hash(files.get(match[2])) !== match[1]) throw new Error("Attached checksum index differs from checked assets");
      covered.add(match[2]);
    }
    if (covered.size !== files.size - 1) throw new Error("Attached checksum index is incomplete");
    const statusStart = notes.lastIndexOf("Current delivery status: ");
    if (statusStart < 0) throw new Error("Missing delivery status for retained notes");
    notes = `${stored}\n${notes.slice(statusStart)}`;
  }
  for (const [name, bytes] of files) {
    const asset = existing.find(item => item.name === name);
    if (asset) {
      if (asset.digest !== `sha256:${hash(bytes)}` || asset.size !== bytes.length || asset.state !== "uploaded") {
        throw new Error(`Existing release asset ${name} differs. It will not be overwritten`);
      }
    } else {
      if (!release.draft) throw new Error("Cannot add missing assets to a published release");
      const uploaded = await api("UPLOAD", `${base}/${release.id}/assets?name=${encodeURIComponent(name)}`, bytes);
      if (uploaded.name !== name || uploaded.digest !== `sha256:${hash(bytes)}` || uploaded.size !== bytes.length || uploaded.state !== "uploaded") {
        throw new Error("Uploaded release asset differs from checked bytes");
      }
    }
  }
  if (!release.draft) {
    if (draft) throw new Error("Publication state regressed. Existing release remains unchanged");
    return release;
  }
  return api("PATCH", `${base}/${release.id}`, { body: notes, draft, prerelease, make_latest: "false" });
}

async function stamp(channel, product, directory, platform) {
  const selected = await requireCI(product, channel);
  if (!["crawler", "crawler-client", "web"].includes(product)) throw new Error("Only binary/static receipts need stamping");
  if (product === "crawler" && !["linux", "windows"].includes(platform)) throw new Error("Crawler receipt needs its platform");
  let paths = filesIn(resolve(directory)).filter(path => allowedBinary(basename(path), product, selected.version));
  if (paths.length < 1 || paths.length > 2) throw new Error("Missing or excess product binary outputs");
  // GitHub replaces spaces in uploaded asset names. Normalize before receipts bind those names.
  const names = paths.map(path => product === "crawler-client" ? basename(path).replaceAll(" ", ".") : basename(path));
  if (new Set(names).size !== names.length) throw new Error("Duplicate output basenames");
  const targets = paths.map((path, index) => join(dirname(path), names[index]));
  if (targets.some((path, index) => path !== paths[index] && existsSync(path))) throw new Error("Installer asset name collision");
  paths = paths.map((path, index) => {
    if (targets[index] !== path) renameSync(path, targets[index]);
    return targets[index];
  });
  const receipt = { ...selected, purpose: "ci-release", commit: process.env.GITHUB_SHA,
    files: paths.map(path => { const bytes = readFileSync(path); return { name: basename(path), size: bytes.length, sha256: hash(bytes) }; }) };
  writeFileSync(join(directory, product === "crawler" ? `crawler-${platform}.receipt.json` : `${product}.receipt.json`), JSON.stringify(receipt, null, 2) + "\n");
}

function githubAPI(env) {
  return async (method, path, body, missing = false) => {
    const upload = method === "UPLOAD";
    const download = method === "DOWNLOAD";
    let response = await fetch(`https://${upload ? "uploads" : "api"}.github.com${path}`, {
      method: upload ? "POST" : download ? "GET" : method, signal: AbortSignal.timeout(60_000), redirect: download ? "manual" : "error",
      headers: { authorization: `Bearer ${env.RELEASE_TOKEN}`, accept: download ? "application/octet-stream" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "content-type": upload ? "application/octet-stream" : "application/json" },
      body: body === undefined ? undefined : upload ? body : JSON.stringify(body)
    });
    if (download && response.status >= 300 && response.status < 400) {
      const url = new URL(response.headers.get("location"));
      if (url.protocol !== "https:" || !["release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(url.hostname) ||
          url.username || url.password || url.port) throw new Error("Unexpected release download redirect");
      response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
    }
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub release request failed (${response.status})`);
    if (response.status === 204) return null;
    if (download) {
      if (Number(response.headers.get("content-length")) > 16_384) throw new Error("Oversized release notes");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 16_384) throw new Error("Oversized release notes");
      return bytes;
    }
    return response.json();
  };
}

/** Poll only checked SDK drafts. Publication and asset verification stay in the attachment workflow. */
export async function reconcileSDKDrafts(api, repository, isPublished) {
  let dispatched = 0;
  for (let page = 1; page <= 10; page++) {
    const releases = await api("GET", `/repos/${repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases)) throw new Error("Invalid release listing");
    for (const release of releases) {
      const match = /^(?:vrcp-api|package)\/v(.+)$/.exec(release.tag_name ?? "");
      if (!release.draft || !match || semver.valid(match[1]) !== match[1]) continue;
      const link = /\[Checked CI run\]\((https:\/\/github\.com\/[^)]+)\)/.exec(release.body ?? "");
      if (!link) continue;
      const url = new URL(link[1]);
      const prefix = `/${repository}/actions/runs/`;
      const sourceRun = url.pathname.slice(prefix.length);
      if (!url.pathname.startsWith(prefix) || !/^\d+$/.test(sourceRun) || url.search || url.hash) continue;
      const channel = match[1].endsWith("-pre") ? "preview" : "release";
      if (!(await isPublished(sdkPackageNames[channel], match[1]))) continue;
      if (++dispatched > 20) throw new Error("SDK draft dispatch limit exceeded");
      await api("POST", `/repos/${repository}/actions/workflows/release-assets.yml/dispatches`,
        { ref: "main", inputs: { tag: release.tag_name, "source-run": sourceRun } });
    }
    if (releases.length < 100) return dispatched;
  }
  throw new Error("SDK draft lookup exceeded its bound");
}

async function reconcile() {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== "true" || !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") || !env.RELEASE_TOKEN) {
    throw new Error("SDK draft checks require the authorized GitHub workflow");
  }
  const dispatched = await reconcileSDKDrafts(githubAPI(env), env.GITHUB_REPOSITORY, async (name, version) => {
    const response = await fetch(`https://registry.npmjs.org/${name}/${version}`, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Cannot check SDK publication");
    const metadata = await response.json();
    if (metadata.name !== name || metadata.version !== version) throw new Error("Unexpected registry SDK identity");
    return true;
  });
  console.log(JSON.stringify({ action: "sdk-draft-check", dispatched }));
}

async function main(directory) {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== "true" || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? "") || !env.RELEASE_TOKEN ||
      !/^\d+$/.test(env.RELEASE_SOURCE_RUN || env.GITHUB_RUN_ID || "") || !env.RUNNER_TEMP) {
    throw new Error("Release attachments require the authorized GitHub workflow");
  }
  const artifactDirectory = realpathSync(resolve(directory));
  if (!artifactDirectory.startsWith(realpathSync(env.RUNNER_TEMP) + sep)) throw new Error("Attachment inputs must stay in runner temporary storage");
  const api = githubAPI(env);
  const runId = env.RELEASE_SOURCE_RUN || env.GITHUB_RUN_ID;
  const run = await api("GET", `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`);
  const tag = env.RELEASE_TAG || env.GITHUB_REF_NAME;
  // Load the source commit's configs, not moving main-branch versions, for a historical attachment retry.
  const gitFile = path => execFileSync("git", ["show", `${run.head_sha}:${path}`], { cwd: root, encoding: "utf8" });
  if (!/^[a-f0-9]{40}$/.test(run.head_sha ?? "")) throw new Error("Invalid source commit");
  const metadataDirectory = mkdtempSync(join(tmpdir(), "vrcp-release-metadata-"));
  let selected;
  try {
    for (const file of ["config.versions.json", "config.preview.versions.json"]) writeFileSync(join(metadataDirectory, file), gitFile(file));
    selected = await resolveTag(tag, metadataDirectory, true);
  } finally { rmSync(metadataDirectory, { recursive: true }); }
  if (selected.product === "worker") throw new Error("Worker bundles are CI-only, not GitHub Release assets");
  const jobs = await api("GET", `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${runId}/jobs?per_page=100`);
  if (jobs.total_count >= 100) throw new Error("Unexpected job count");
  checkSourceRun(run, jobs.jobs, tag, env.GITHUB_REPOSITORY, selected.product);
  const ref = await api("GET", `/repos/${env.GITHUB_REPOSITORY}/git/ref/tags/${encodeURIComponent(tag)}`);
  let object = ref.object;
  for (let depth = 0; object.type === "tag" && depth < 4; depth++) object = (await api("GET", `/repos/${env.GITHUB_REPOSITORY}/git/tags/${object.sha}`)).object;
  if (object.type !== "commit" || object.sha !== run.head_sha) throw new Error("Tag differs from artifact source commit");
  const manifest = JSON.parse(gitFile(`${productDirectories[selected.product]}/package.json`));
  // Package builds sync channel identities after checkout. Other manifest names stay fixed.
  const assets = checkedAssets(filesIn(artifactDirectory), selected, run.head_sha, manifest);
  let status = "checked artifacts only";
  let draft = false;
  if (selected.product === "package") {
    const name = sdkPackageNames[selected.channel];
    const response = await fetch(`https://registry.npmjs.org/${name}/${selected.version}`, { signal: AbortSignal.timeout(30_000), redirect: "error" });
    if (response.status === 404) { draft = true; status = "npm publication pending"; }
    else {
      if (!response.ok) throw new Error("Cannot check SDK publication");
      const metadata = await response.json();
      const url = new URL(metadata.dist?.tarball);
      if (metadata.name !== name || metadata.version !== selected.version || url.origin !== "https://registry.npmjs.org") throw new Error("Unexpected registry SDK identity");
      const publicArtifact = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
      if (!publicArtifact.ok || hash(Buffer.from(await publicArtifact.arrayBuffer())) !== hash(assets.get(`${name}-${selected.version}.tgz`))) {
        throw new Error("Published SDK bytes differ from CI artifacts");
      }
      status = "npm publication checked";
    }
  }
  const notes = milestoneNotes(readFileSync(join(root, "docs/source/CHANGELOG.md"), "utf8"), selected.product, selected,
    run.head_sha, `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`, "checked artifacts. See the release description for publication/deployment status");
  assets.set("CHANGELOG.md", Buffer.from(notes));
  assets.set("CHECKSUMS.sha256", Buffer.from([...assets].map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") + "\n"));
  const release = await attachRelease(api, env.GITHUB_REPOSITORY, tag, run.head_sha,
    `${notes}\nCurrent delivery status: ${status}.\n`, assets, draft, selected.channel === "preview");
  console.log(JSON.stringify({ tag, sourceRun: runId, status, draft: release.draft, url: release.html_url, assets: [...assets.keys()] }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  try {
    if (action === "stamp" && args.length >= 3 && args.length <= 4) await stamp(...args);
    else if (action === "attach" && args.length === 1) await main(args[0]);
    else if (action === "reconcile" && args.length === 0) await reconcile();
    else throw new Error("Use release-assets.mjs stamp <channel> <product> <directory> [platform], or attach <runner-directory>");
  } catch (error) { console.error(error instanceof Error ? error.message : "Release attachment failed"); process.exitCode = 1; }
}
