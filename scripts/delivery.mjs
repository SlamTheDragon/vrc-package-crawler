import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { distributedArtifact, productDirectories, readVersionConfig, sdkPackageNames, versionFiles } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = { "vrc-packages-api": "package", "vrc-packages-network": "network" };

export function checkSDKPublicationVersion(version, channel = "release", name = sdkPackageNames.release) {
  const parsed = semver.parse(version);
  if (channel === "preview" && name === sdkPackageNames.preview && parsed?.prerelease[0] === "pre") return;
  if (channel !== "release" || name !== sdkPackageNames.release || !parsed || parsed.major !== 0 || parsed.minor !== 0 || parsed.prerelease.length) {
    throw new Error("SDK publication requires a pre-0.1 version. The owner API review hold includes v0.1 prereleases.");
  }
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

export async function resolveTag(tag, workspace = root) {
  if (typeof tag !== "string" || tag.trim() !== tag) throw new Error("Tag must be an exact canonical string");
  const match = /^(crawler|crawler-client|package|network|web|worker)\/v(.+)$/.exec(tag ?? "");
  if (!match || semver.valid(match[2]) !== match[2]) throw new Error("Expected <product>/v<canonical-semver> tag");
  const [, product, version] = match;
  const matches = [];
  for (const channel of ["release", "preview"]) {
    const { config } = await readVersionConfig(channel, workspace);
    if (config[`${channel}-${product}`] === version) matches.push(channel);
  }
  if (matches.length !== 1) throw new Error("Tag must match exactly one version config. Equal channel values need an explicit channel-tag decision.");
  const channel = matches[0];
  const environment = product === "package"
    ? channel === "preview" ? "vrcp-api-preview" : "vrcp-api-release"
    : product === "worker" && channel === "preview" ? "cloudflare-preview"
    : channel === "preview" ? "preview" : "production";
  return { product, version, channel, environment };
}

export async function requireCI(product, channel, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "push" ||
      !env.GITHUB_REF?.startsWith(`refs/tags/${product}/v`) || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("Release artifacts and remote actions require a matching GitHub tag-push job. Local output is development-only.");
  }
  return resolveTag(env.GITHUB_REF.slice("refs/tags/".length)).then(tag => {
    if (tag.product !== product || tag.channel !== channel) throw new Error("CI tag selects another product/channel");
    return tag;
  });
}

function npm(args, cwd, capture = false) {
  const cli = [process.env.npm_execpath, join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")]
    .find(path => path?.endsWith("npm-cli.js") && existsSync(path));
  if (!cli) throw new Error("Run through npm, or use a Node installation that includes npm");
  return execFileSync(process.execPath, [cli, ...args], { cwd, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
}

function inspectDependencies(project, latestVersion) {
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  for (const name of Object.keys(artifacts)) {
    const expected = manifest.dependencies?.[name];
    if (!expected) continue;
    const artifact = distributedArtifact(name, expected, latestVersion);
    const path = join(project, "node_modules", name);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(realpathSync(project) + sep)) {
      throw new Error(`${name} requires an installed artifact, not a sibling/workspace link. Run delivery prepare first.`);
    }
    const installed = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (installed.name !== artifact.name || installed.version !== artifact.version) throw new Error(`${name} installed identity/version differs from its declared artifact`);
  }
}

/** Produce product-local development artifacts or CI-only release artifacts. Never tag or push. */
export async function deliver(action, channel, product, ci = false) {
  if (!["prepare", "build", "pack", "verify", "deploy", "publish"].includes(action) ||
      !["release", "preview"].includes(channel) || !Object.hasOwn(productDirectories, product)) {
    throw new Error("Usage: delivery.mjs <prepare|build|pack|verify|deploy|publish> <release|preview> <product> [--ci]");
  }
  if (["deploy", "publish"].includes(action) && !ci) throw new Error("Remote actions are CI-only");
  if (action === "deploy" && product !== "worker") throw new Error("Only Worker deployment is configured. Web hosting remains owner-selected.");
  if (action === "publish" && product !== "package") throw new Error("Only SDK npm publication is conditionally authorized. Internal registry remains undecided.");
  if (["pack", "verify"].includes(action) && !["package", "network"].includes(product)) throw new Error("Pack/verify applies only to distributed packages");
  if (ci) await requireCI(product, channel);
  await versionFiles("check", channel, product);
  const { config } = await readVersionConfig(channel);
  const sdkVersion = config[`${channel}-package`];
  const project = resolve(root, productDirectories[product]);
  const manifest = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));

  if (action === "prepare") {
    const inputs = [];
    const needsNetwork = !!manifest.dependencies?.["vrc-packages-network"];
    const needsSDK = product === "network" || !!manifest.dependencies?.["vrc-packages-api"];
    for (const name of ["package", ...(needsNetwork ? ["network"] : [])]) {
      if (!needsSDK) break;
      const dependencyChannel = channel;
      if (name === "package") await versionFiles("sync", dependencyChannel, name);
      await versionFiles("check", dependencyChannel, name);
      const dependencyProject = resolve(root, productDirectories[name]);
      if (ci && product === "worker" && name === "package") {
        inputs.push(`vrc-packages-api@file:${packRegistrySDK(dependencyProject, channel)}`);
        continue;
      }
      npm(["install", "--no-save", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", ...inputs], dependencyProject);
      inspectDependencies(dependencyProject, sdkVersion);
      npm(["run", "build"], dependencyProject);
      const artifact = pack(dependencyProject, false);
      inputs.push(name === "package" ? `vrc-packages-api@file:${artifact}` : artifact);
    }
    // These are packed JS/type dependencies. No sibling source is read by a consumer build.
    npm(["install", "--no-save", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund", ...inputs], project);
    inspectDependencies(project, sdkVersion);
  } else {
    if (!["deploy", "publish"].includes(action)) inspectDependencies(project, sdkVersion);
    if (action === "build") {
      if (product === "worker") {
        npm(["run", `build:${channel}`], project);
        if (ci) {
          const bundle = join(project, ".wrangler/dev-build", channel === "preview" ? "preview" : "production", "worker_entry.js");
          writeFileSync(`${bundle}.json`, JSON.stringify({ purpose: "ci-release", product,
            name: manifest.name, version: manifest.version, channel, commit: process.env.GITHUB_SHA,
            configSha256: createHash("sha256").update(readFileSync(join(project, "wrangler.toml"))).digest("hex"),
            sha256: createHash("sha256").update(readFileSync(bundle)).digest("hex") }, null, 2) + "\n");
        }
      }
      else if (product === "crawler") npm(["run", process.platform === "win32" ? "build:dev" : "build:node:linux"], project);
      else if (product === "crawler-client" && !ci) npm(["run", "build:dev"], project);
      else npm(["run", "build"], project);
    } else if (action === "pack") {
      npm(["run", "build"], project);
      console.log(JSON.stringify({ artifact: pack(project, ci), purpose: ci ? "ci-release" : "development" }));
    } else if (action === "verify") {
      if (product === "package") npm(["test"], project);
      npm(["run", "typecheck"], project);
      const dependency = product === "network" ? distributedArtifact("vrc-packages-api", manifest.dependencies["vrc-packages-api"], sdkVersion) : null;
      const sdk = dependency && resolve(root, productDirectories.package, ".artifacts/dev", `${dependency.name}-${dependency.version}.tgz`);
      npm(["run", "test:distribution", ...(product === "network" ? ["--", "--sdk-tarball", sdk] : [])], project);
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
      validateCIArtifact(receipt, { name: manifest.name, version: manifest.version, commit: process.env.GITHUB_SHA }, readFileSync(artifact));
      npm(["publish", artifact, "--access", "public", "--tag", "latest"], project);
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

function packRegistrySDK(project, channel) {
  const { name, version } = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  const registry = "https://registry.npmjs.org";
  const spec = `${name}@latest`;
  const metadata = JSON.parse(npm(["view", spec, "--json", `--registry=${registry}`], root, true));
  if (metadata.name !== sdkPackageNames[channel] || metadata.version !== version) {
    throw new Error("Registry SDK channel resolves outside the authoritative version config");
  }
  const destination = join(project, ".artifacts/dev");
  mkdirSync(destination, { recursive: true });
  const [result] = JSON.parse(npm(["pack", `${name}@${version}`, "--ignore-scripts", "--json", `--registry=${registry}`,
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
  const [result] = JSON.parse(npm(["pack", "--ignore-scripts", "--json", "--pack-destination", destination], project, true));
  const expected = JSON.parse(readFileSync(join(project, "package.json"), "utf8"));
  if (result.name !== expected.name || result.version !== expected.version ||
      !result.files.every(file => ["package.json", "README.md", "LICENSE", "LICENSE.md"].includes(file.path) ||
        /^dist\/.*\.(js|d\.ts)$/.test(file.path))) throw new Error("Packed artifact contains unexpected identity or files");
  console.log(JSON.stringify({ name: result.name, version: result.version, integrity: result.integrity, purpose: ci ? "ci-release" : "development" }));
  const artifact = join(destination, result.filename);
  writeFileSync(`${artifact}.json`, JSON.stringify({ name: result.name, version: result.version,
    integrity: result.integrity, sha256: createHash("sha256").update(readFileSync(artifact)).digest("hex"),
    purpose: ci ? "ci-release" : "development", commit: ci ? process.env.GITHUB_SHA : null }, null, 2) + "\n");
  return artifact;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, channel, product, flag, ...extra] = process.argv.slice(2);
  try {
    if (action === "tag") {
      if (product || flag || extra.length) throw new Error("Tag command takes exactly one tag");
      const selected = await resolveTag(channel);
      console.log(JSON.stringify(selected));
      if (process.env.GITHUB_OUTPUT) {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(selected).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
      }
    } else {
      if (extra.length || (flag && flag !== "--ci")) throw new Error("Only --ci is accepted after the product");
      console.log(JSON.stringify(await deliver(action, channel, product, flag === "--ci")));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Delivery command failed");
    process.exitCode = 1;
  }
}
