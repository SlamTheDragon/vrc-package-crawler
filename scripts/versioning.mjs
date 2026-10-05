import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import semver from "semver";

const root = fileURLToPath(new URL("../", import.meta.url));
export const productDirectories = {
  crawler: "src-crawler", "crawler-client": "src-crawler-client", package: "src-package",
  web: "src-web", worker: "src-worker", network: "src-worker/packages/network"
};
export const productTagPrefixes = {
  package: "vrcp-api", network: "vrcp-network", worker: "cloudflare-worker",
  crawler: "vrcp-crawler", "crawler-client": "vrcp-crawler-client", web: "web"
};
const products = Object.keys(productDirectories);
const distributedProducts = { "vrc-packages-api": "package", "vrc-packages-network": "network" };
export const sdkPackageNames = { release: "vrc-packages-api", preview: "vrc-packages-api-preview" };

export function distributedArtifact(name, spec, latestVersion) {
  const previewPrefix = `npm:${sdkPackageNames.preview}@`;
  const preview = name === sdkPackageNames.release && typeof spec === "string" && spec.startsWith(previewPrefix);
  const selected = preview ? spec.slice(previewPrefix.length) : spec;
  const version = selected === "latest" && name === sdkPackageNames.release ? latestVersion : selected;
  if (!Object.hasOwn(distributedProducts, name) || typeof version !== "string" || semver.valid(version) !== version) {
    throw new Error("Distributed dependency requires an exact configured version, approved preview alias or config-checked latest");
  }
  return { name: preview ? sdkPackageNames.preview : name, version };
}

export async function readVersionConfig(channel, workspace = root) {
  if (!["release", "preview"].includes(channel)) throw new Error("Channel must be release or preview");
  const configPath = resolve(workspace, channel === "release" ? "config.versions.json" : "config.preview.versions.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const keys = products.map(name => `${channel}-${name}`);
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      Object.keys(config).length !== keys.length || keys.some(key => !Object.hasOwn(config, key))) {
    throw new Error(`Version config must contain exactly: ${keys.join(", ")}`);
  }
  for (const key of keys) {
    const value = config[key];
    if (typeof value !== "string" || semver.valid(value) !== value) {
      throw new Error(`${key} must be a canonical SemVer version`);
    }
    const prerelease = semver.prerelease(value);
    if (key === "preview-package" && !/^\d{4}\.(?:[1-9]|1[0-2])\.\d+-pre$/.test(value)) {
      throw new Error("preview-package must use YYYY.M.Patch-pre with an npm-compatible month and no trailing prerelease counter");
    }
    if (key === "preview-crawler-client" &&
        (!/^\d{1,2}\.(?:[1-9]|1[0-2])\.\d+-pre$/.test(value) || semver.patch(value) > 65535)) {
      throw new Error("preview-crawler-client must use YY.M.Patch-pre, with patch at most 65535 for MSI");
    }
    if (channel === "release" && prerelease !== null) throw new Error(`${key} must not contain a prerelease label`);
    // UI/headless artifacts can retain stable versions in the preview config. They are not Worker environments.
    const requiresPrerelease = ["package", "network", "worker"].some(product => key === `preview-${product}`);
    if (channel === "preview" && ((requiresPrerelease && prerelease === null) ||
        (prerelease !== null && (prerelease.length !== 1 || prerelease[0] !== "pre")))) throw new Error(`${key} must use only the pre prerelease label when required`);
  }
  return { config, configPath };
}

/** Compute a version without changing config or metadata. */
export function nextVersion(channel, product, increment, previous, now = new Date()) {
  if (!products.includes(product) ||
      !(channel === "release" ? ["patch", "minor", "major"] : ["patch"]).includes(increment)) {
    throw new Error("Use bump release <product> <patch|minor|major> or bump preview <product> patch");
  }
  if (semver.valid(previous) !== previous) throw new Error("Previous version must be canonical SemVer");
  if (channel === "preview") {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Preview bump requires a valid calendar date");
    const bumped = semver.parse(semver.inc(previous.split("-")[0], "patch"));
    if (!bumped) throw new Error("Preview patch exceeds the supported version range");
    if (product === "crawler-client" && bumped.patch > 65535) throw new Error("Desktop preview patch exceeds the MSI limit of 65535");
    const year = product === "crawler-client" ? now.getUTCFullYear() % 100 : now.getUTCFullYear();
    return `${year}.${now.getUTCMonth() + 1}.${bumped.patch}${semver.prerelease(previous) ? "-pre" : ""}`;
  } else {
    const version = semver.inc(previous, increment);
    if (!version) throw new Error("Version exceeds the supported range");
    return version;
  }
}

/** Change one config value only. Sync, build, tag and publication remain separate. */
export async function bumpVersion(channel, product, increment, workspace = root, now = new Date()) {
  const { config, configPath } = await readVersionConfig(channel, workspace);
  const key = `${channel}-${product}`;
  const previous = config[key];
  config[key] = nextVersion(channel, product, increment, previous, now);
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  return { channel, product, previous, version: config[key], configPath };
}

/** Sync metadata only. This command never builds, tags, publishes or deploys. */
export async function versionFiles(mode, channel, product = "all", workspace = root) {
  if (!["check", "sync"].includes(mode) || !["release", "preview"].includes(channel) ||
      (product !== "all" && !products.includes(product))) {
    throw new Error("Usage: versioning.mjs <check|sync> <release|preview> [crawler|crawler-client|package|web|worker|network|all]");
  }
  const { config } = await readVersionConfig(channel, workspace);
  // Prepare every selected edit before writing. Invalid input leaves files unchanged.
  const edits = [];
  for (const name of product === "all" ? products : [product]) {
    const version = config[`${channel}-${name}`];
    const path = resolve(workspace, productDirectories[name], "package.json");
    const text = await readFile(path, "utf8");
    const manifest = JSON.parse(text);
    if (typeof manifest.version !== "string") throw new Error(`Missing package version: ${path}`);
    let changed = manifest.version !== version;
    if (name === "package" && manifest.name !== sdkPackageNames[channel]) {
      manifest.name = sdkPackageNames[channel];
      changed = true;
    }
    for (const [dependency, dependencyProduct] of Object.entries(distributedProducts)) {
      if (Object.hasOwn(manifest.dependencies ?? {}, dependency)) {
        const artifactVersion = dependencyProduct === "package" && channel === "preview"
          ? `npm:${sdkPackageNames.preview}@${name === "network" ? config["preview-package"] : "latest"}`
          : dependencyProduct === "package" && name === "worker" ? "latest" : config[`${channel}-${dependencyProduct}`];
        if (manifest.dependencies[dependency] !== artifactVersion) {
          manifest.dependencies[dependency] = artifactVersion;
          changed = true;
        }
      }
    }
    if (changed) {
      manifest.version = version;
      const indent = text.match(/\n([\t ]+)"/)?.[1] ?? "  ";
      edits.push({ path, content: JSON.stringify(manifest, null, indent) + "\n" });
    }
    if (name === "crawler-client") {
      const cargoPath = resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml");
      const cargoText = await readFile(cargoPath, "utf8");
      // Edit one known scalar, not a TOML reserialization that removes owner comments.
      const lines = cargoText.split(/\r?\n/);
      const start = lines.findIndex(line => line.trim() === "[package]");
      if (start < 0) throw new Error("Cargo.toml is missing [package]");
      let versionLine = -1;
      for (let index = start + 1; index < lines.length && !/^\s*\[/.test(lines[index]); index++) {
        if (/^\s*version\s*=/.test(lines[index])) {
          if (versionLine >= 0) throw new Error("Cargo package has duplicate version fields");
          versionLine = index;
        }
      }
      const scalar = versionLine < 0 ? null : /^(\s*version\s*=\s*")([^"]+)("\s*(?:#.*)?)$/.exec(lines[versionLine]);
      if (!scalar || semver.valid(scalar[2]) !== scalar[2]) throw new Error("Cargo package version must be a literal SemVer string");
      if (scalar[2] !== version) {
        lines[versionLine] = `${scalar[1]}${version}${scalar[3]}`;
        edits.push({ path: cargoPath, content: lines.join(cargoText.includes("\r\n") ? "\r\n" : "\n") });
      }
      const tauriPath = resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json");
      const tauriText = await readFile(tauriPath, "utf8");
      const tauri = JSON.parse(tauriText);
      if (tauri.version !== "../package.json") throw new Error("Tauri must read ../package.json for its version");
      // MSI cannot represent the app's pre label. Its numeric version still comes from the same config.
      const msiVersion = version.split("-")[0];
      if (semver.major(version) > 255 || semver.minor(version) > 255 || semver.patch(version) > 65535) {
        throw new Error("Desktop version exceeds MSI numeric field limits");
      }
      if (tauri.bundle?.windows?.wix?.version !== msiVersion) {
        tauri.bundle ??= {};
        tauri.bundle.windows ??= {};
        tauri.bundle.windows.wix ??= {};
        tauri.bundle.windows.wix.version = msiVersion;
        const indent = tauriText.match(/\n([\t ]+)"/)?.[1] ?? "  ";
        edits.push({ path: tauriPath, content: JSON.stringify(tauri, null, indent) + "\n" });
      }
    }
  }
  if (mode === "check" && edits.length) {
    throw new Error(`Version metadata differs from ${channel} config: ${edits.map(edit => edit.path).join(", ")}`);
  }
  if (mode === "sync") {
    for (const edit of edits) await writeFile(edit.path, edit.content);
  }
  return { mode, channel, product, changed: edits.map(edit => edit.path) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, channel, product, ...extra] = process.argv.slice(2);
  try {
    if (mode === "bump") {
      if (extra.length !== 1) throw new Error("Bump requires one increment");
      console.log(JSON.stringify(await bumpVersion(channel, product, extra[0])));
    } else {
      if (extra.length) throw new Error("Unexpected version command arguments");
      console.log(JSON.stringify(await versionFiles(mode, channel, product)));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Version metadata command failed");
    process.exitCode = 1;
  }
}
