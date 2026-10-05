import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { distributedArtifact, productDirectories, productTagPrefixes, readVersionConfig, sdkPackageNames, sdkChannelForProduct, versionFiles } from "./versioning.mjs";

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
    headers: { accept: "application/json" } });
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
  const delays = [1_000, 2_000, 4_000, 8_000, 16_000], signal = AbortSignal.timeout(90_000);
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

export async function requireCI(product, channel, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "push" ||
      !env.GITHUB_REF?.startsWith(`refs/tags/${productTagPrefixes[product]}/v`) || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("Release artifacts and remote actions require a matching GitHub tag-push job. Local output is development-only.");
  }
  return resolveTag(env.GITHUB_REF.slice("refs/tags/".length)).then(tag => {
    if (tag.product !== product || tag.channel !== channel) throw new Error("CI tag selects another product/channel");
    return tag;
  });
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
export async function deliver(action, channel, product, ci = false) {
  if (product === "network" && channel === "release") throw new Error("Network has one rapid stream; use preview network");
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
      if (product === "package") packageCommand(["run", "test"], project);
      packageCommand(["run", "typecheck"], project);
      if (product === "network") {
        // Pack once. Both SDK channels must consume these same network bytes.
        packageCommand(["run", "build"], project);
        const network = pack(project, false);
        for (const sdkChannel of ["release", "preview"]) {
          const sdkConfig = (await readVersionConfig(sdkChannel)).config;
          const sdk = packRegistrySDK(resolve(root, productDirectories.package), sdkChannel, sdkConfig[`${sdkChannel}-package`]);
          packageCommand(["run", "test:distribution", "--sdk-tarball", sdk, "--network-tarball", network], project);
        }
      } else packageCommand(["run", "test:distribution"], project);
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
  const spec = `${name}@latest`;
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
    purpose: ci ? "ci-release" : "development", commit: ci ? process.env.GITHUB_SHA : null }, null, 2) + "\n");
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
  })();
}
