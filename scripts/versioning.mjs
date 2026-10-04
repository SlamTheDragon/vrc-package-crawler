import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import semver from "semver";

const root = fileURLToPath(new URL("../", import.meta.url));
const products = ["crawler", "crawler-client", "package", "web", "worker"];

/** Sync metadata only. This command never builds, tags, publishes or deploys. */
export async function versionFiles(mode, channel, product = "all", workspace = root) {
  if (!["check", "sync"].includes(mode) || !["release", "preview"].includes(channel) ||
      (product !== "all" && !products.includes(product))) {
    throw new Error("Usage: versioning.mjs <check|sync> <release|preview> [crawler|crawler-client|package|web|worker|all]");
  }
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
    if (channel === "release" && prerelease !== null) throw new Error(`${key} must not contain a prerelease label`);
    if (channel === "preview" && prerelease?.[0] !== "pre") throw new Error(`${key} must use the pre prerelease label`);
  }

  // Prepare every selected edit before writing. Invalid input leaves files unchanged.
  const edits = [];
  for (const name of product === "all" ? products : [product]) {
    const version = config[`${channel}-${name}`];
    const path = resolve(workspace, `src-${name}/package.json`);
    const text = await readFile(path, "utf8");
    const manifest = JSON.parse(text);
    if (typeof manifest.version !== "string") throw new Error(`Missing package version: ${path}`);
    if (manifest.version !== version) {
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
      const tauri = JSON.parse(await readFile(tauriPath, "utf8"));
      if (tauri.version !== "../package.json") throw new Error("Tauri must read ../package.json for its version");
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
    if (extra.length) throw new Error("Unexpected version command arguments");
    console.log(JSON.stringify(await versionFiles(mode, channel, product)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Version metadata command failed");
    process.exitCode = 1;
  }
}
