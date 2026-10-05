import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import semver from "semver";
import { requireCI } from "./delivery.mjs";
import { readVersionConfig, sdkPackageNames } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const directory = join(root, "src-crawler/.artifacts/ci/container");

export function imageLabels(expected) {
  return { "org.opencontainers.image.version": expected.version, "org.opencontainers.image.revision": expected.commit,
    "org.opencontainers.image.source": `https://github.com/${expected.repository}`, "io.vrcp.channel": expected.channel,
    "io.vrcp.sdk.name": expected.sdkName, "io.vrcp.sdk.version": expected.sdkVersion, "io.vrcp.network.version": expected.networkVersion };
}

export function checkImage(image, expected) {
  assert(image && digestPattern.test(image.Id), "Container image ID is invalid");
  assert(image.Os === "linux" && image.Architecture === "amd64", "Container must be Linux amd64");
  assert(image.Config?.User === "vrcpuser" && image.Config.WorkingDir === "/app/data", "Container runtime must be unprivileged with persistent working directory");
  assert.deepEqual(image.Config.Entrypoint, ["/app/vrcp-crawler-node"], "Container entry point differs");
  assert(image.Config.Volumes && Object.hasOwn(image.Config.Volumes, "/app/data"), "Container persistent volume is missing");
  for (const [key, value] of Object.entries(imageLabels(expected))) assert.equal(image.Config.Labels?.[key], value, `Container label differs: ${key}`);
  return image.Id;
}

export function checkContainerReceipt(receipt, expected, sha256, size) {
  assert(receipt?.purpose === "ci-container" && receipt.archive === "container.tar" && digestPattern.test(receipt.imageId), "Container receipt is invalid");
  for (const [key, value] of Object.entries(expected)) assert.equal(receipt[key], value, `Container receipt differs: ${key}`);
  assert(/^[a-f0-9]{64}$/.test(sha256) && receipt.sha256 === sha256 && size > 0 && receipt.size === size, "Container archive bytes differ from receipt");
}

/** Docker owns registry authentication and image formats. Treat only explicit missing-manifest errors as absence. */
export function registryMissing(error, ref) {
  return ["manifest unknown", "name unknown", `ERROR: ${ref}: not found`].includes(error.trim());
}

function docker(args, allowMissing = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 600_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const ref = args[args.length - 1];
    const error = result.stderr.trim();
    if (allowMissing && registryMissing(error, ref)) return null;
    throw new Error(`Docker ${args[0]} failed (${result.status}). Registry denial and transport errors are not missing images.`);
  }
  return result.stdout;
}

function remoteManifest(ref, run) {
  const raw = run(["buildx", "imagetools", "inspect", "--raw", ref], true);
  if (raw === null) return null;
  const manifest = JSON.parse(raw);
  assert(manifest.schemaVersion === 2 && digestPattern.test(manifest.config?.digest) && !manifest.manifests &&
    Array.isArray(manifest.layers) && manifest.layers.length > 0 && manifest.layers.every(layer => digestPattern.test(layer.digest)),
    "Registry image must be a single-platform manifest");
  return manifest;
}

/** Never rebuild, overwrite a version tag, or roll latest back during a retry. */
export function publishCheckedImage(expected, receipt, run = docker) {
  const namespace = expected.repository.split("/")[0].toLowerCase();
  assert(/^[a-z0-9][a-z0-9-]*$/.test(namespace) && ["release", "preview"].includes(expected.channel) &&
    semver.valid(expected.version) === expected.version && expected.version.length <= 128 && digestPattern.test(receipt.imageId),
    "Invalid container publication target");
  const name = expected.channel === "preview" ? "vrcp-crawler-node-preview" : "vrcp-crawler-node";
  const image = `ghcr.io/${namespace}/${name}`;
  const versionRef = `${image}:${expected.version}`;
  const aliasRef = `${image}:latest`;
  const previous = remoteManifest(versionRef, run);
  assert(!previous || previous.config.digest === receipt.imageId, "Existing container version is immutable and has different bytes");
  const alias = remoteManifest(aliasRef, run);
  if (alias && alias.config.digest !== receipt.imageId) {
    const config = JSON.parse(run(["buildx", "imagetools", "inspect", "--format", "{{json .Image}}", aliasRef]));
    const labels = config.config?.Labels;
    // Exact published patch-0 identities survive the owner's repository rename.
    // This does not relax checkImage or receipt validation for new deliveries.
    const historical = expected.channel === "preview"
      ? { version: "2026.10.0-pre", digest: "sha256:29d1c6940253dee085fbc14bacef01ae23e991bb55a78fcdc084082a60993035" }
      : { version: "0.0.0", digest: "sha256:8c7723e19689ec23eb6e95774ec22205e36d16375b12468313214fd97ec3c215" };
    const renamedBaseline = expected.repository === "SlamTheDragon/vrc-packages" &&
      labels?.["org.opencontainers.image.source"] === "https://github.com/SlamTheDragon/vrc-package-crawler" &&
      labels?.["org.opencontainers.image.revision"] === "fb9edf66ce1b9954bd672826a3090c735b60632d" &&
      labels?.["org.opencontainers.image.version"] === historical.version && alias.config.digest === historical.digest;
    assert(labels?.["io.vrcp.channel"] === expected.channel &&
      (labels?.["org.opencontainers.image.source"] === `https://github.com/${expected.repository}` || renamedBaseline),
      "Existing latest image has an unreviewed identity");
    const version = labels["org.opencontainers.image.version"];
    assert(semver.valid(version) === version && semver.lt(version, expected.version), "Container retry cannot roll latest back or replace the same version");
  }
  for (const [ref, existing] of [[versionRef, previous], [aliasRef, alias]]) {
    if (existing?.config.digest === receipt.imageId) continue;
    run(["tag", receipt.imageId, ref]);
    run(["push", ref]);
    assert.equal(remoteManifest(ref, run)?.config.digest, receipt.imageId, "Published image differs from checked image");
  }
  const digest = run(["buildx", "imagetools", "inspect", "--format", "{{.Manifest.Digest}}", versionRef]).trim();
  assert(digestPattern.test(digest), "Registry manifest digest is invalid");
  return { ...expected, purpose: "container-publication", image, imageId: receipt.imageId, registryDigest: digest,
    archiveSha256: receipt.sha256, immutableRef: `${image}@${digest}`, alias: "latest" };
}

export async function archiveDigest(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), "Container archive must be a regular file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { sha256: hash.digest("hex"), size: stat.size };
}

async function main(action, channel) {
  assert(["seal", "load", "publish"].includes(action), "Expected container-delivery.mjs <seal|load|publish> <release|preview>");
  const selected = await requireCI("crawler", channel);
  const { config } = await readVersionConfig(channel);
  const repository = process.env.GITHUB_REPOSITORY;
  assert(/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ""), "Container receipt needs the source repository");
  const expected = { product: "crawler", channel, version: selected.version, commit: process.env.GITHUB_SHA, repository,
    sdkName: sdkPackageNames[channel], sdkVersion: config[`${channel}-package`], networkVersion: config[`${channel}-network`] };
  const checkTag = `vrcp-node-check:${expected.commit}`;
  const archive = join(directory, "container.tar");
  const receiptPath = join(directory, "container.receipt.json");
  const inspect = () => {
    const images = JSON.parse(docker(["image", "inspect", checkTag]));
    assert(Array.isArray(images) && images.length === 1, "Expected one checked container image");
    return checkImage(images[0], expected);
  };
  if (action === "seal") {
    assert(!existsSync(archive) && !existsSync(receiptPath), "Existing container archive cannot be overwritten");
    const imageId = inspect();
    mkdirSync(directory, { recursive: true });
    docker(["save", "--output", archive, checkTag]);
    writeFileSync(receiptPath, JSON.stringify({ ...expected, purpose: "ci-container", archive: "container.tar", imageId,
      ...await archiveDigest(archive) }, null, 2) + "\n", { flag: "wx" });
    return;
  }
  if (action === "publish") {
    const approval = channel === "preview" ? "VRCP_CRAWLER_PREVIEW_PUBLISH_APPROVED" : "VRCP_CRAWLER_RELEASE_PUBLISH_APPROVED";
    assert(process.env.VRCP_CONTAINER_PUBLISH_APPROVED === "true" && process.env[approval] === "true", "Container publication needs global and channel approval");
  }
  assert.deepEqual(readdirSync(directory).sort(), ["container.receipt.json", "container.tar"], "Unexpected container handoff files");
  assert(!lstatSync(receiptPath).isSymbolicLink(), "Container receipt cannot be a symlink");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const { sha256, size } = await archiveDigest(archive);
  checkContainerReceipt(receipt, expected, sha256, size);
  docker(["load", "--input", archive]);
  assert.equal(inspect(), receipt.imageId, "Loaded image differs from checked archive");
  if (action === "publish") {
    const publication = publishCheckedImage(expected, receipt);
    writeFileSync(join(directory, "../container-publication.json"), JSON.stringify(publication, null, 2) + "\n");
    console.log(JSON.stringify(publication));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv[2], process.argv[3]);
