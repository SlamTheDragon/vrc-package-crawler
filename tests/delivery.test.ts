import { expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { bumpVersion, distributedArtifact, networkArchiveURL, productDirectories, readVersionConfig, sdkPackageNames, sdkChannelForProduct, versionFiles } from "../scripts/versioning.mjs";
import { checkSDKPublicationVersion, deliver, requireCI, resolveTag, stageSDKArtifact, publishPreviewSDKArtifact, previewOIDCFailure, validateCIArtifact, validateRegistrySDK, validateSDKStage, workerSecretBindings } from "../scripts/delivery.mjs";

test("preview npm failure summaries expose only statuses and fixed flags, never raw authentication logs", () => {
  const summary = previewOIDCFailure("npm http fetch POST 403 https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/vrc-packages-api-preview 12ms\n" +
    "npm verbose oidc Failed token exchange request with body message: SYNTHETIC_PRIVATE_VALUE\n" +
    "npm error code ENEEDAUTH\nAuthorization: Bearer SYNTHETIC_PRIVATE_VALUE");
  expect(summary).toEqual({ action: "preview-npm-auth-failure", exchangeStatuses: [403], tokenInstalled: false,
    exchangeRejected: true, oidcException: false, noCredentials: true });
  expect(JSON.stringify(summary)).not.toContain("SYNTHETIC_PRIVATE_VALUE");
  expect(previewOIDCFailure("npm http fetch POST https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/example 201 2ms\n" +
    "npm verbose oidc Successfully retrieved and set token").exchangeStatuses).toEqual([201]);
  expect(previewOIDCFailure("npm verbose oidc Successfully retrieved and set token").tokenInstalled).toBe(true);
  expect(previewOIDCFailure(undefined).exchangeStatuses).toEqual([]);
});

async function fixture(run: (workspace: string) => Promise<void>) {
  const parent = await realpath(tmpdir());
  const workspace = await mkdtemp(resolve(parent, "vrcp-delivery-"));
  try {
    for (const channel of ["release", "preview"]) {
      const config = Object.fromEntries(Object.keys(productDirectories).filter(name => channel !== "release" || name !== "network").map(name =>
        [`${channel}-${name}`, channel === "release" ? "0.0.1" : name === "crawler-client" ? "26.10.1-pre" : name === "network" ? "2026.10.1" : "2026.10.1-pre"]));
      await writeFile(resolve(workspace, channel === "release" ? "config.versions.json" : "config.preview.versions.json"), JSON.stringify(config));
    }
    for (const [name, path] of Object.entries(productDirectories)) {
      await mkdir(resolve(workspace, path), { recursive: true });
      const dependencies = ["package", "network"].includes(name) ? {} : { "vrc-packages-api": "0.0.1" };
      if (["crawler", "worker"].includes(name)) dependencies["vrc-packages-network"] = networkArchiveURL("2026.10.1");
      const peer = name === "network" ? { peerDependencies: { "vrc-packages-api": "0.0.1 || 2026.10.1-pre" },
        devDependencies: { "vrc-packages-api": "0.0.1" } } : {};
      await writeFile(resolve(workspace, path, "package.json"), JSON.stringify({ name, version: "0.0.1", dependencies, ...peer }));
    }
    await mkdir(resolve(workspace, "src-crawler-client/src-tauri"));
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), '[package]\nversion = "0.0.1" # retain owner note\n');
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), '{"version":"../package.json"}');
    await run(workspace);
  } finally {
    const path = relative(parent, await realpath(workspace));
    if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) throw new Error("Unsafe fixture cleanup");
    await rm(workspace, { recursive: true });
  }
}

test("tag routing follows the config, not a hardcoded sample or a branch", async () => {
  await fixture(async workspace => {
    expect(await resolveTag("cloudflare-worker/v2026.10.1-pre", workspace)).toEqual({
      product: "worker", version: "2026.10.1-pre", channel: "preview", environment: "cloudflare-preview"
    });
    expect((await resolveTag("web/v0.0.1", workspace)).environment).toBe("production");
    expect((await resolveTag("vrcp-api/v2026.10.1-pre", workspace)).environment).toBe("vrcp-api-preview");
    expect((await resolveTag("vrcp-api/v0.0.1", workspace)).environment).toBe("vrcp-api-release");
    expect((await resolveTag("cloudflare-worker/v0.0.1", workspace)).environment).toBe("production");
    expect((await resolveTag("vrcp-crawler/v2026.10.1-pre", workspace)).environment).toBe("preview");
    expect((await resolveTag("vrcp-crawler/v0.0.1", workspace)).environment).toBe("production");
    for (const tag of ["v0.0.1", "main", "cloudflare-worker/v0.0.2", "cloudflare-worker/v01.0.1", "unknown/v0.0.1", "cloudflare-worker/v0.0.1\n"]) {
      await expect(resolveTag(tag, workspace)).rejects.toThrow();
    }
  });
}, 15_000);

test("stable UI preview versions are allowed but equal channel tags remain ambiguous", async () => {
  await fixture(async workspace => {
    const path = resolve(workspace, "config.preview.versions.json");
    const { config } = await readVersionConfig("preview", workspace);
    config["preview-web"] = "0.0.1";
    await writeFile(path, JSON.stringify(config));
    expect((await readVersionConfig("preview", workspace)).config["preview-web"]).toBe("0.0.1");
    await expect(resolveTag("web/v0.0.1", workspace)).rejects.toThrow("exactly one");
    config["preview-package"] = "0.0.1";
    await writeFile(path, JSON.stringify(config));
    await expect(readVersionConfig("preview", workspace)).rejects.toThrow("pre");
  });
});

test("product-specific tags are canonical while historical prefixes are attachment-only", async () => {
  await fixture(async workspace => {
    for (const [prefix, product] of [["vrcp-api", "package"],
      ["cloudflare-worker", "worker"], ["vrcp-crawler", "crawler"], ["vrcp-crawler-client", "crawler-client"]]) {
      expect((await resolveTag(`${prefix}/v0.0.1`, workspace)).product).toBe(product);
      await expect(resolveTag(`${product}/v0.0.1`, workspace)).rejects.toThrow("product-specific");
      expect((await resolveTag(`${product}/v0.0.1`, workspace, true)).product).toBe(product);
    }
    expect((await resolveTag("vrcp-network/v2026.10.1", workspace)).channel).toBe("preview");
    await expect(resolveTag("vrcp-network/v0.0.1", workspace)).rejects.toThrow("exactly one");
  });
  const config = (await readVersionConfig("release")).config;
  await expect(requireCI("worker", "release", { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push",
    GITHUB_REF: `refs/tags/worker/v${config["release-worker"]}`, GITHUB_SHA: "a".repeat(40) })).rejects.toThrow("matching");
});

test("selected-product sync pins distributed dependencies without changing another product", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-crawler/package.json"), "utf8");
    await versionFiles("sync", "preview", "worker", workspace);
    const worker = JSON.parse(await readFile(resolve(workspace, "src-worker/package.json"), "utf8"));
    expect(worker.version).toBe("2026.10.1-pre");
    expect(worker.dependencies).toEqual({ "vrc-packages-api": "npm:vrc-packages-api-preview@latest", "vrc-packages-network": networkArchiveURL("2026.10.1") });
    expect(await readFile(resolve(workspace, "src-crawler/package.json"), "utf8")).toBe(before);
    await versionFiles("check", "preview", "worker", workspace);
    await expect(versionFiles("check", "release", "worker", workspace)).rejects.toThrow("differs");
  });
});

test("all-product sync preserves Cargo comments and Tauri manifest ownership", async () => {
  await fixture(async workspace => {
    await versionFiles("sync", "preview", "all", workspace);
    await versionFiles("check", "preview", "all", workspace);
    const sdk = JSON.parse(await readFile(resolve(workspace, "src-package/package.json"), "utf8"));
    expect(sdk.name).toBe(sdkPackageNames.preview);
    expect(sdk.version).toBe("2026.10.1-pre");
    const network = JSON.parse(await readFile(resolve(workspace, "src-worker/packages/network/package.json"), "utf8"));
    expect(network.dependencies["vrc-packages-api"]).toBeUndefined();
    expect(network.peerDependencies["vrc-packages-api"]).toBe("0.0.1 || 2026.10.1-pre");
    expect(network.devDependencies["vrc-packages-api"]).toBe("npm:vrc-packages-api-preview@latest");
    expect(await readFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), "utf8"))
      .toContain('version = "26.10.1-pre" # retain owner note');
    const tauri = JSON.parse(await readFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), "utf8"));
    expect(tauri.version).toBe("../package.json");
    expect(tauri.bundle.windows.wix.version).toBe("26.10.1");
    await versionFiles("sync", "release", "all", workspace);
    await versionFiles("check", "release", "all", workspace);
    expect(JSON.parse(await readFile(resolve(workspace, "src-package/package.json"), "utf8")).name).toBe(sdkPackageNames.release);
    expect(JSON.parse(await readFile(resolve(workspace, "src-worker/package.json"), "utf8")).dependencies["vrc-packages-api"]).toBe("npm:vrc-packages-api-preview@latest");
    expect(JSON.parse(await readFile(resolve(workspace, "src-crawler/package.json"), "utf8")).dependencies["vrc-packages-api"]).toBe("npm:vrc-packages-api-preview@latest");
    for (const project of ["src-web", "src-crawler-client"]) {
      expect(JSON.parse(await readFile(resolve(workspace, project, "package.json"), "utf8")).dependencies["vrc-packages-api"]).toBe("latest");
    }
  });
});

test("versioning CLI bumps use tagged delivery, never the metadata-only primitive", () => {
  const source = readFileSync(new URL("../scripts/versioning.mjs", import.meta.url), "utf8");
  const cli = source.slice(source.indexOf('if (process.argv[1]'));
  expect(cli).toContain('await import("./delivery-chain.mjs")');
  expect(cli).toContain('await startDelivery(channel, product, extra[1] === "--execute")');
  expect(cli).not.toContain("await bumpVersion(");
  expect(cli).toContain('extra[0] !== "patch"');
});

test("owner SDK mapping does not change with artifact channels and product delivery forwards to root", () => {
  for (const channel of ["release", "preview"]) {
    for (const product of ["crawler", "worker"]) expect(sdkChannelForProduct(product, channel)).toBe("preview");
    for (const product of ["crawler-client", "web"]) expect(sdkChannelForProduct(product, channel)).toBe("release");
    expect(sdkChannelForProduct("package", channel)).toBe(channel);
  }
  expect(() => sdkChannelForProduct("unknown", "preview")).toThrow();
  expect(() => sdkChannelForProduct("worker", "unknown")).toThrow();
  for (const product of ["crawler", "worker", "crawler-client", "web", "package", "network"]) {
    const manifest = JSON.parse(readFileSync(new URL(`../${productDirectories[product]}/package.json`, import.meta.url), "utf8"));
    const prefix = product === "network" ? "../../.." : "..";
    expect(manifest.scripts["delivery:preview"]).toBe(`bun run --cwd ${prefix} delivery:preview ${product}`);
    if (product !== "network") expect(manifest.scripts["delivery:release"]).toBe(`bun run --cwd .. delivery:release ${product}`);
    else expect(manifest.scripts["delivery:release"]).toBeUndefined();
  }
});

test("Bun is pinned before every workflow install and owns all package-script forwarding", () => {
  for (const directory of [".", ...Object.values(productDirectories)]) {
    const manifest = JSON.parse(readFileSync(new URL(`../${directory}/package.json`, import.meta.url), "utf8"));
    expect(manifest.packageManager).toBe("bun@1.4.2");
    for (const command of Object.values(manifest.scripts) as string[]) {
      expect(command).not.toMatch(/\bnpm\s+(?:run|install|ci|--prefix)\b/);
    }
  }
  for (const name of ["cache-maintenance", "cloudflare-worker", "network", "node-client", "node-docker",
    "release-assets", "sdk-release-reconcile", "vrc-packages-api"]) {
    const workflow: any = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
    for (const job of Object.values(workflow.jobs) as any[]) {
      let bunReady = false;
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("oven-sh/setup-bun@")) {
          expect(step.with["bun-version"]).toBe("1.4.2");
          bunReady = true;
        }
        if (/\bbun\s/.test(step.run ?? "")) expect(bunReady).toBe(true);
        expect(step.run ?? "").not.toMatch(/\bnpm\s+(?:run|ci|--prefix)\b/);
        if (/\bnpm\s+install\b/.test(step.run ?? "")) {
          expect(name).toBe("vrc-packages-api");
          expect(step.run).toBe("npm install --global npm@11.19.0");
        }
      }
    }
  }
  const worker: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/cloudflare-worker.yml", import.meta.url), "utf8"));
  const tool = worker.jobs.deploy.steps.find((step: any) => step.name === "Install pinned deployment tool only").run;
  expect(tool.indexOf("mkdir -p src-worker/.wrangler/ci-tools")).toBeLessThan(tool.indexOf("bun install --cwd"));
  const tauri = JSON.parse(readFileSync(new URL("../src-crawler-client/src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  expect(tauri.build.beforeDevCommand).toBe("bun run dev:web");
  expect(tauri.build.beforeBuildCommand).toBe("bun run build:web");
});

test("Bun product forwarding executes the root command instead of exiting successfully with help", async () => {
  await fixture(async workspace => {
    await writeFile(resolve(workspace, "package.json"), JSON.stringify({ type: "module", scripts: {
      "delivery:preview": "node forwarding_probe.mjs preview", "delivery:release": "node forwarding_probe.mjs release"
    } }));
    await writeFile(resolve(workspace, "forwarding_probe.mjs"),
      'console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));');
    for (const [product, directory] of Object.entries(productDirectories)) {
      const actual = JSON.parse(readFileSync(new URL(`../${directory}/package.json`, import.meta.url), "utf8"));
      await writeFile(resolve(workspace, directory, "package.json"), JSON.stringify({ scripts: actual.scripts }));
      for (const channel of product === "network" ? ["preview"] : ["preview", "release"]) {
        const result = JSON.parse(execFileSync("bun", ["run", "--cwd", directory, `delivery:${channel}`, "--probe"],
          { cwd: workspace, encoding: "utf8", stdio: "pipe", timeout: 15_000 }));
        expect(result.args).toEqual([channel, product, "--probe"]);
        expect(resolve(result.cwd)).toBe(resolve(workspace));
      }
    }
  });
}, 30_000);

test("SDK synchronization updates network peer bounds without bumping its stream or switching consumers", async () => {
  await fixture(async workspace => {
    const networkPath = resolve(workspace, productDirectories.network, "package.json");
    const networkVersion = (await readVersionConfig("preview", workspace)).config["preview-network"];
    const consumers = await Promise.all(["crawler", "worker"].map(name => readFile(resolve(workspace, productDirectories[name], "package.json"), "utf8")));
    for (const channel of ["preview", "release"] as const) {
      const { config, configPath } = await readVersionConfig(channel, workspace);
      config[`${channel}-package`] = channel === "preview" ? "2026.10.2-pre" : "0.0.2";
      await writeFile(configPath, JSON.stringify(config));
      const result = await versionFiles("sync", channel, "package", workspace);
      expect(result.changed).toContain(networkPath);
      const network = JSON.parse(await readFile(networkPath, "utf8"));
      expect(network.version).toBe(networkVersion);
      expect(network.peerDependencies["vrc-packages-api"]).toBe(`${channel === "release" ? "0.0.2" : "0.0.1"} || 2026.10.2-pre`);
      expect(network.dependencies["vrc-packages-api"]).toBeUndefined();
      await versionFiles("check", channel, "package", workspace);
    }
    expect(await Promise.all(["crawler", "worker"].map(name => readFile(resolve(workspace, productDirectories[name], "package.json"), "utf8")))).toEqual(consumers);
  });
});

test("network peer metadata follows both SDK configs without allowing a runtime channel override", async () => {
  await fixture(async workspace => {
    const path = resolve(workspace, productDirectories.network, "package.json");
    const previewPath = resolve(workspace, "config.preview.versions.json");
    const { config } = await readVersionConfig("preview", workspace);
    config["preview-package"] = "2026.10.2-pre";
    await writeFile(previewPath, JSON.stringify(config));
    await versionFiles("sync", "preview", "network", workspace);
    const network = JSON.parse(await readFile(path, "utf8"));
    expect(network.peerDependencies["vrc-packages-api"]).toBe("0.0.1 || 2026.10.2-pre");
    expect(network.devDependencies["vrc-packages-api"]).toBe("npm:vrc-packages-api-preview@latest");
    network.dependencies["vrc-packages-api"] = "0.0.1";
    const invalid = JSON.stringify(network);
    await writeFile(path, invalid);
    await expect(versionFiles("sync", "preview", "network", workspace)).rejects.toThrow("consumer-supplied peer");
    expect(await readFile(path, "utf8")).toBe(invalid);
    delete network.dependencies["vrc-packages-api"];
    delete network.peerDependencies;
    await writeFile(path, JSON.stringify(network));
    await expect(versionFiles("sync", "preview", "network", workspace)).rejects.toThrow("explicit SDK peer");
  });
});

test("single network stream rejects new release bumps while historical config tags remain readable", async () => {
  await fixture(async workspace => {
    await expect(bumpVersion("release", "network", "patch", workspace)).rejects.toThrow("one rapid stream");
    await expect(versionFiles("sync", "release", "network", workspace)).rejects.toThrow("one rapid stream");
    expect((await bumpVersion("preview", "network", "patch", workspace, new Date("2027-01-01T00:00:00Z"))).version).toBe("2027.1.2");
    const path = resolve(workspace, "config.versions.json");
    const { config } = await readVersionConfig("release", workspace);
    config["release-network"] = "0.0.1";
    await writeFile(path, JSON.stringify(config));
    await expect(readVersionConfig("release", workspace)).rejects.toThrow("exactly");
    expect((await resolveTag("vrcp-network/v0.0.1", workspace, true)).channel).toBe("release");
  });
});

test("bump changes only one authoritative config value, not local metadata or external state", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-worker/package.json"), "utf8");
    expect((await bumpVersion("preview", "worker", "patch", workspace, new Date("2026-10-05T00:00:00Z"))).version).toBe("2026.10.2-pre");
    expect((await bumpVersion("release", "worker", "minor", workspace)).version).toBe("0.1.0");
    expect(await readFile(resolve(workspace, "src-worker/package.json"), "utf8")).toBe(before);
    await expect(bumpVersion("release", "worker", "pre", workspace)).rejects.toThrow();
  });
});

test("invalid configs and later native metadata fail before any sync writes", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-worker/package.json"), "utf8");
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), '{"version":"1.0.0"}');
    await expect(versionFiles("sync", "preview", "all", workspace)).rejects.toThrow("Tauri must read");
    expect(await readFile(resolve(workspace, "src-worker/package.json"), "utf8")).toBe(before);
    await writeFile(resolve(workspace, "config.preview.versions.json"), '{"preview-worker":"1.0.0-pre", "extra":true}');
    await expect(versionFiles("sync", "preview", "worker", workspace)).rejects.toThrow("exactly");
  });
});

test("local sessions cannot authorize release artifacts or remote mutation", async () => {
  for (const env of [{}, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/tags/cloudflare-worker/v0.0.0" },
    { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }]) {
    await expect(requireCI("worker", "release", env)).rejects.toThrow("tag-push");
  }
  await expect(deliver("deploy", "release", "worker")).rejects.toThrow("CI-only");
  await expect(deliver("publish", "preview", "package")).rejects.toThrow("CI-only");
  await expect(deliver("build", "release", "all")).rejects.toThrow("Usage:");
});

test("release SDK retains its API hold while only the preview identity permits CalVer prereleases", () => {
  for (const version of ["0.0.0", "0.0.1", "0.0.99"]) expect(() => checkSDKPublicationVersion(version)).not.toThrow();
  for (const version of ["0.0.0-pre", "0.1.0-pre.1", "0.1.0", "1.0.0", "2026.10.0-pre", "invalid"]) {
    expect(() => checkSDKPublicationVersion(version)).toThrow("owner API review hold");
  }
  expect(() => checkSDKPublicationVersion("2026.10.0-pre", "preview", sdkPackageNames.preview)).not.toThrow();
  for (const version of ["2026.10.0", "2026.10.0-beta", "invalid"]) {
    expect(() => checkSDKPublicationVersion(version, "preview", sdkPackageNames.preview)).toThrow();
  }
  expect(() => checkSDKPublicationVersion("2026.10.0-pre", "preview", sdkPackageNames.release)).toThrow();
  expect(() => checkSDKPublicationVersion("0.0.0", "release", sdkPackageNames.preview)).toThrow();
});

test("distributed identity parsing accepts only exact SDK aliases and config-checked latest", () => {
  expect(distributedArtifact("vrc-packages-network", networkArchiveURL("2026.10.1")))
    .toEqual({ name: "vrc-packages-network", version: "2026.10.1" });
  for (const spec of [networkArchiveURL("2026.10.1").replace("github.com", "attacker.invalid"),
    networkArchiveURL("2026.10.1") + "?token=not-allowed", networkArchiveURL("2026.10.1").replace("/v2026.10.1/", "/v2026.10.2/")]) {
    expect(() => distributedArtifact("vrc-packages-network", spec)).toThrow("canonical network");
  }
  expect(distributedArtifact("vrc-packages-api", "latest", "0.0.0")).toEqual({ name: sdkPackageNames.release, version: "0.0.0" });
  expect(distributedArtifact("vrc-packages-api", "npm:vrc-packages-api-preview@2026.10.0-pre")).toEqual({ name: sdkPackageNames.preview, version: "2026.10.0-pre" });
  expect(distributedArtifact("vrc-packages-api", "npm:vrc-packages-api-preview@latest", "2026.10.0-pre"))
    .toEqual({ name: sdkPackageNames.preview, version: "2026.10.0-pre" });
  expect(distributedArtifact("vrc-packages-network", "0.0.0")).toEqual({ name: "vrc-packages-network", version: "0.0.0" });
  for (const [name, spec] of [["vrc-packages-api", "latest"], ["vrc-packages-network", "latest"],
    ["vrc-packages-api", "npm:unapproved@0.0.0"], ["vrc-packages-api", "npm:vrc-packages-api-preview@pre"],
    ["vrc-packages-api", "npm:vrc-packages-api-preview@latest"],
    ["vrc-packages-api", "^0.0.0"], ["vrc-packages-api", "file:../src-package"], ["unknown", "0.0.0"]]) {
    expect(() => distributedArtifact(name, spec)).toThrow("Distributed dependency");
  }
});

test("each SDK identity stages latest and Worker registry selection still checks its configured version", () => {
  const source = readFileSync(new URL("../scripts/delivery.mjs", import.meta.url), "utf8");
  expect(source).toContain('run(["stage", "publish", artifact, "--access", "public", "--tag", "latest",');
  expect(source).toContain('const spec = process.env.VRCP_RECOVERY_TAG ? `${name}@${version}` : `${name}@latest`');
  expect(source).toContain('metadata.name !== sdkPackageNames[channel] || metadata.version !== version');
});

test("packed consumer declarations are checked in installed consumers, not through package self-reference", () => {
  const config = JSON.parse(readFileSync(new URL("../src-package/tsconfig.json", import.meta.url), "utf8"));
  expect(config.exclude).toContain("tests/fixtures");
  const harness = readFileSync(new URL("../src-package/tests/distribution_smoke.mjs", import.meta.url), "utf8");
  expect(harness).toContain("'--noEmit', '--strict'");
  expect(harness).toContain("'consumer.mts'");
  expect(harness).toContain("`vrc-packages-api@file:${tarball}`");
});

test("SDK verification builds through its test script before typechecking tests that import dist", () => {
  const source = readFileSync(new URL("../scripts/delivery.mjs", import.meta.url), "utf8");
  const verify = source.slice(source.indexOf('} else if (action === "verify")'), source.indexOf('} else if (action === "deploy")'));
  const sdkTest = verify.indexOf('if (product === "package") packageCommand(["run", "test"], project)');
  const types = verify.indexOf('packageCommand(["run", "typecheck"], project)');
  expect(sdkTest).toBeGreaterThan(-1);
  expect(types).toBeGreaterThan(sdkTest);
  const manifest = JSON.parse(readFileSync(new URL("../src-package/package.json", import.meta.url), "utf8"));
  expect(manifest.scripts.test).toMatch(/build\s*&&\s*bun test/);
});

test("preview package CalVer increments patch and refuses a trailing prerelease counter", async () => {
  await fixture(async workspace => {
    expect((await bumpVersion("preview", "package", "patch", workspace, new Date("2026-10-05T00:00:00Z"))).version).toBe("2026.10.2-pre");
    await expect(bumpVersion("preview", "package", "pre", workspace)).rejects.toThrow("patch");
    const path = resolve(workspace, "config.preview.versions.json");
    const { config } = await readVersionConfig("preview", workspace);
    for (const invalid of ["2026.10.0-pre.0", "2026.13.0-pre", "2026.01.0-pre", "0.0.1-pre", "2026.10.0-beta"]) {
      config["preview-package"] = invalid;
      await writeFile(path, JSON.stringify(config));
      await expect(readVersionConfig("preview", workspace)).rejects.toThrow();
    }
  });
});

test("preview bumps derive UTC year and month while only incrementing patch, without build-time mutation", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-worker/package.json"), "utf8");
    expect((await bumpVersion("preview", "package", "patch", workspace, new Date("2026-11-01T00:00:00Z"))).version)
      .toBe("2026.11.2-pre");
    expect((await bumpVersion("preview", "package", "patch", workspace, new Date("2027-01-01T00:00:00Z"))).version)
      .toBe("2027.1.3-pre");
    expect((await bumpVersion("preview", "web", "patch", workspace, new Date("2027-01-01T00:00:00Z"))).version)
      .toBe("2027.1.2-pre");
    const snapshot = await readFile(resolve(workspace, "config.preview.versions.json"), "utf8");
    await expect(bumpVersion("preview", "package", "patch", workspace, new Date("invalid"))).rejects.toThrow("calendar date");
    expect(await readFile(resolve(workspace, "config.preview.versions.json"), "utf8")).toBe(snapshot);
    expect(await readFile(resolve(workspace, "src-worker/package.json"), "utf8")).toBe(before);
  });
});

test("desktop preview uses short UTC years, retains pre and syncs Cargo from the saved config", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-crawler-client/package.json"), "utf8");
    expect((await resolveTag("vrcp-crawler-client/v26.10.1-pre", workspace)).channel).toBe("preview");
    expect((await bumpVersion("preview", "crawler-client", "patch", workspace, new Date("2026-11-01T00:00:00Z"))).version)
      .toBe("26.11.2-pre");
    expect((await bumpVersion("preview", "crawler-client", "patch", workspace, new Date("2027-01-01T00:00:00Z"))).version)
      .toBe("27.1.3-pre");
    expect(await readFile(resolve(workspace, "src-crawler-client/package.json"), "utf8")).toBe(before);
    expect((await readVersionConfig("preview", workspace)).config["preview-package"]).toBe("2026.10.1-pre");
    await versionFiles("sync", "preview", "crawler-client", workspace);
    await versionFiles("check", "preview", "crawler-client", workspace);
    expect(await readFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), "utf8"))
      .toContain('version = "27.1.3-pre" # retain owner note');
    expect(JSON.parse(await readFile(resolve(workspace, "src-crawler-client/package.json"), "utf8")).version).toBe("27.1.3-pre");
    const tauri = JSON.parse(await readFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), "utf8"));
    expect(tauri.bundle.windows.wix.version).toBe("27.1.3");
    tauri.bundle.windows.wix.version = "27.1.2";
    await writeFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), JSON.stringify(tauri));
    await expect(versionFiles("check", "preview", "crawler-client", workspace)).rejects.toThrow("metadata differs");
    await versionFiles("sync", "release", "crawler-client", workspace);
    expect(JSON.parse(await readFile(resolve(workspace, "src-crawler-client/src-tauri/tauri.conf.json"), "utf8"))
      .bundle.windows.wix.version).toBe("0.0.1");
  });
});

test("MSI numeric field overflow fails before any metadata sync writes", async () => {
  await fixture(async workspace => {
    const { config, configPath } = await readVersionConfig("release", workspace);
    const cargoPath = resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml");
    const manifestPath = resolve(workspace, "src-crawler-client/package.json");
    const beforeCargo = await readFile(cargoPath, "utf8");
    const beforeManifest = await readFile(manifestPath, "utf8");
    for (const invalid of ["256.0.0", "0.256.0", "0.0.65536"]) {
      config["release-crawler-client"] = invalid;
      await writeFile(configPath, JSON.stringify(config));
      await expect(versionFiles("sync", "release", "crawler-client", workspace)).rejects.toThrow("MSI numeric");
      expect(await readFile(cargoPath, "utf8")).toBe(beforeCargo);
      expect(await readFile(manifestPath, "utf8")).toBe(beforeManifest);
    }
  });
});

test("desktop preview rejects invalid calendar fields and MSI patch overflow before writes", async () => {
  await fixture(async workspace => {
    const path = resolve(workspace, "config.preview.versions.json");
    const { config } = await readVersionConfig("preview", workspace);
    for (const invalid of ["2026.10.1-pre", "26.0.1-pre", "26.13.1-pre", "26.01.1-pre", "26.10.1", "26.10.65536-pre"]) {
      config["preview-crawler-client"] = invalid;
      await writeFile(path, JSON.stringify(config));
      await expect(readVersionConfig("preview", workspace)).rejects.toThrow();
    }
    config["preview-crawler-client"] = "26.10.65535-pre";
    await writeFile(path, JSON.stringify(config));
    const before = await readFile(path, "utf8");
    await expect(bumpVersion("preview", "crawler-client", "patch", workspace, new Date("2026-11-01T00:00:00Z")))
      .rejects.toThrow("MSI limit");
    expect(await readFile(path, "utf8")).toBe(before);
  });
});

test("CI artifact promotion rejects changed bytes, identity, config, channel, commit and development receipts", () => {
  const bytes = Buffer.from("single-file Worker fixture");
  const expected = { product: "worker", name: "vrcp-worker", version: "0.0.0-pre", channel: "preview",
    commit: "a".repeat(40), configSha256: "b".repeat(64) };
  const receipt = { ...expected, purpose: "ci-release", sha256: createHash("sha256").update(bytes).digest("hex") };
  expect(() => validateCIArtifact(receipt, expected, bytes)).not.toThrow();
  for (const invalid of [null, {}, { ...receipt, purpose: "development" }, { ...receipt, name: "other" },
    { ...receipt, product: "package" }, { ...receipt, version: "0.0.1-pre" }, { ...receipt, channel: "release" },
    { ...receipt, commit: "c".repeat(40) }, { ...receipt, configSha256: "d".repeat(64) }, { ...receipt, sha256: "e".repeat(64) }]) {
    expect(() => validateCIArtifact(invalid, expected, bytes)).toThrow("CI artifact");
  }
  expect(() => validateCIArtifact(receipt, expected, Buffer.from("modified"))).toThrow("CI artifact");
  expect(() => validateCIArtifact(receipt, { ...expected, commit: undefined }, bytes)).toThrow("CI artifact");
  const sdkExpected = { name: "vrc-packages-api", version: "0.0.0", commit: expected.commit };
  const sdkReceipt = { ...sdkExpected, purpose: "ci-release", sha256: receipt.sha256 };
  expect(() => validateCIArtifact(sdkReceipt, sdkExpected, bytes)).not.toThrow();
  expect(() => validateCIArtifact({ ...sdkReceipt, commit: undefined }, { ...sdkExpected, commit: undefined }, bytes))
    .toThrow("CI artifact");
});

test("CI artifact generation requires a commit as well as a matching tag push", async () => {
  const { config } = await readVersionConfig("release");
  const env = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: `refs/tags/cloudflare-worker/v${config["release-worker"]}` };
  for (const commit of [undefined, "", "short", "g".repeat(40)]) {
    await expect(requireCI("worker", "release", { ...env, GITHUB_SHA: commit })).rejects.toThrow("tag-push");
  }
  await expect(requireCI("worker", "release", { ...env, GITHUB_SHA: "a".repeat(40) })).rejects.toThrow("original Actions run identity");
});

test("npm stages bind checked SDK identity, explicit latest, UUID and artifact checksum", () => {
  const bytes = Buffer.from("checked development fixture bytes");
  const stage = { id: "9ab1b418-531d-41df-aa66-2f66bdde947b", packageName: sdkPackageNames.preview,
    version: "2026.10.0-pre", tag: "latest", shasum: createHash("sha1").update(bytes).digest("hex") };
  const expected = { name: stage.packageName, version: stage.version };
  expect(validateSDKStage(stage, expected, bytes)).toBe(stage.id);
  for (const invalid of [null, {}, { ...stage, id: "../escape" }, { ...stage, id: stage.id + "\n" },
    { ...stage, packageName: sdkPackageNames.release }, { ...stage, version: "2026.10.1-pre" },
    { ...stage, tag: "preview" }, { ...stage, shasum: "0".repeat(40) }]) {
    expect(() => validateSDKStage(invalid, expected, bytes)).toThrow("npm stage");
  }
  expect(() => validateSDKStage(stage, { ...expected, name: "unrelated" }, bytes)).toThrow();
  expect(() => validateSDKStage(stage, expected, Buffer.from("changed"))).toThrow();
});

test("SDK staging retains checked tarballs, verifies pending bytes and never approves publication in CI", () => {
  const source = readFileSync(new URL("../scripts/delivery.mjs", import.meta.url), "utf8");
  const publisher = source.slice(source.indexOf('export function stageSDKArtifact'), source.indexOf('async function readPublicSDK'));
  expect(publisher.indexOf('validateCIArtifact(receipt, expected, bytes)')).toBeLessThan(publisher.indexOf('["stage", "publish", artifact'));
  expect(publisher).toContain('["stage", "list", expected.name, "--json", registry]');
  expect(publisher).toContain('matches.length > 1');
  expect(publisher).toContain('["stage", "view", stageId');
  expect(publisher).toContain('["stage", "download", stageId');
  expect(publisher).toContain('validateCIArtifact(receipt, expected, readFileSync(stagedArtifact))');
  expect(publisher).toContain('"awaiting-npm-approval"');
  expect(publisher).toContain('"--ignore-scripts", "--json", registry');
  expect(publisher).not.toContain('["publish", artifact');
  expect(publisher).not.toContain('["stage", "approve"');
  expect(publisher).not.toContain('["stage", "reject"');
  const workflow = readFileSync(new URL("../.github/workflows/vrc-packages-api.yml", import.meta.url), "utf8");
  expect(workflow).toContain('npm install --global npm@11.19.0');
  expect(workflow).toContain("'published' || 'stage'");
  const definition = Bun.YAML.parse(workflow);
  expect(definition.jobs.publish.permissions['id-token']).toBe('write');
  expect(definition.on.workflow_dispatch.inputs['diagnose-preview-oidc'].default).toBe(false);
  expect(definition.jobs.build.if).toBe("github.event_name == 'push'");
  const diagnostic = definition.jobs['preview-trust-check'];
  expect(diagnostic.environment).toBe('vrcp-api-preview');
  expect(diagnostic.permissions).toEqual({ 'id-token': 'write' });
  expect(diagnostic.if).toContain("github.event_name == 'workflow_dispatch'");
  expect(diagnostic.steps).toHaveLength(2);
  expect(diagnostic.steps[1].run).not.toMatch(/npm (publish|stage|dist-tag)/);
  expect(diagnostic.steps[1].run).not.toContain('exchange.json');
  expect(diagnostic.steps[1].run).not.toContain('JSON.stringify(claims)');
  const preview = definition.jobs.publish.steps.find((step: any) => step.name?.includes('through its trusted publisher'));
  expect(preview.if).toBe("needs.build.outputs.channel == 'preview'");
  expect(preview.env).toEqual({ NODE_AUTH_TOKEN: '', NPM_TOKEN: '' });
  const release = definition.jobs.publish.steps.find((step: any) => step.name?.startsWith('Stage checked release'));
  expect(release.if).toBe("needs.build.outputs.channel == 'release'");
});

test("release proof readers receive history and read-only metadata scope in every tagged caller", () => {
  for (const name of ["cloudflare-worker", "node-client", "node-docker", "vrc-packages-api"]) {
    const workflow = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
    expect(workflow.env.GH_TOKEN).toBe("${{ github.token }}");
    for (const job of Object.values(workflow.jobs) as any[]) {
      if (!job.steps?.some((step: any) => step.uses === "actions/checkout@v4")) continue;
      for (const step of job.steps.filter((step: any) => step.uses === "actions/checkout@v4")) {
        expect(step.with.ref).toBe(["node-docker", "node-client"].includes(name) ? "${{ inputs.recovery-tag || github.ref }}" : "${{ github.ref }}");
        expect(step.with["fetch-depth"]).toBe(0);
      }
      const permissions = job.permissions ?? workflow.permissions;
      expect(permissions.contents).toBe("read");
      expect(permissions.actions).toBe("read");
      expect(permissions["pull-requests"]).toBe("read");
    }
  }
  for (const name of ["node-client", "node-docker", "vrc-packages-api", "network"]) {
    const workflow = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
    const caller = workflow.jobs["release-assets"];
    expect(caller.uses).toBe("./.github/workflows/release-assets.yml");
    expect(caller.permissions["pull-requests"]).toBe("read");
  }
  const source = readFileSync(new URL("../scripts/release-assets.mjs", import.meta.url), "utf8");
  const main = source.slice(source.indexOf("async function main("));
  const proof = main.indexOf("await checkReleaseSource(selected");
  expect(proof).toBeGreaterThan(-1);
  expect(main).toContain("actor: run.actor, ...(recovery ? {} : { context: run })");
  expect(main.indexOf("await checkRecoveryRun(run")).toBeLessThan(proof);
  expect(proof).toBeLessThan(main.indexOf("await attachRelease("));
});

test("direct preview publication checks bytes before writes and recovers a lost ACK without republishing", async () => {
  await fixture(async workspace => {
    const artifact = resolve(workspace, "preview-fixture.tgz"), bytes = Buffer.from("Synthetic preview fixture, not a release artifact");
    await writeFile(artifact, bytes);
    const expected = { name: sdkPackageNames.preview, version: "2026.10.1-pre", commit: "a".repeat(40) };
    const receipt = { ...expected, purpose: "ci-release", sha256: createHash("sha256").update(bytes).digest("hex") };
    const metadata = { name: expected.name, version: expected.version,
      dist: { integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } };
    let published: any = null, latest: any = null, calls = 0, lostACK = true;
    const registry = async (_name: string, version: string) => version === "latest" ? latest : published;
    const run = (args: string[], cwd: string) => {
      expect(resolve(cwd)).toBe(resolve(import.meta.dir, ".."));
      if (args[0] === "--version") return "11.19.0";
      expect(args).toEqual(["publish", artifact, "--access", "public", "--tag", "latest", "--ignore-scripts", "--json", "--registry=https://registry.npmjs.org"]);
      calls++; published = latest = metadata;
      if (lostACK) throw new Error("lost publication acknowledgment");
      return "{}";
    };
    await expect(publishPreviewSDKArtifact(artifact, expected, { ...receipt, sha256: "changed" }, run, registry)).rejects.toThrow("CI artifact");
    expect(calls).toBe(0);
    await expect(publishPreviewSDKArtifact(artifact, { ...expected, name: sdkPackageNames.release },
      { ...receipt, name: sdkPackageNames.release }, run, registry)).rejects.toThrow("preview-only");
    await expect(publishPreviewSDKArtifact(artifact, expected, receipt, run, registry)).rejects.toThrow("lost publication acknowledgment");
    expect((await publishPreviewSDKArtifact(artifact, expected, receipt, run, registry)).status).toBe("published-verified");
    expect(calls).toBe(1);
    published = { ...metadata, dist: { integrity: "changed" } };
    await expect(publishPreviewSDKArtifact(artifact, expected, receipt, run, registry)).rejects.toThrow("checked artifact");
    published = null; latest = { ...metadata, version: "2026.10.2-pre" };
    await expect(publishPreviewSDKArtifact(artifact, expected, receipt, run, registry)).rejects.toThrow("roll back");
    latest = null;
    await expect(publishPreviewSDKArtifact(artifact, expected, receipt, () => "11.18.0", registry)).rejects.toThrow("CLI 11.19.0");
    await expect(publishPreviewSDKArtifact(artifact, expected, receipt, run, async () => { throw new Error("registry unavailable"); }))
      .rejects.toThrow("registry unavailable");
    expect(calls).toBe(1); lostACK = false;
    expect((await publishPreviewSDKArtifact(artifact, expected, receipt, run, registry)).status).toBe("published-verified");
    expect(calls).toBe(2);
  });
});

test("preview readback waits for propagation but never republishes or accepts mismatched bytes", async () => {
  await fixture(async workspace => {
    const artifact = resolve(workspace, "propagation-fixture.tgz"), bytes = Buffer.from("Synthetic registry propagation fixture");
    await writeFile(artifact, bytes);
    const expected = { name: sdkPackageNames.preview, version: "2026.10.3-pre", commit: "a".repeat(40) };
    const receipt = { ...expected, purpose: "ci-release", sha256: createHash("sha256").update(bytes).digest("hex") };
    const metadata = { name: expected.name, version: expected.version,
      dist: { integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } };
    for (const outcome of ["converged", "late-converged", "missing", "wrong-bytes", "newer-alias", "unavailable"] as const) {
      let writes = 0, reads = 0;
      const delays: number[] = [];
      const run = (args: string[]) => { if (args[0] === "--version") return "11.19.0"; writes++; return "{}"; };
      const registry = async (_name: string, version: string, signal?: AbortSignal) => {
        if (!writes) return null;
        expect(signal).toBeInstanceOf(AbortSignal);
        if (outcome === "unavailable") throw new Error("registry unavailable");
        if (version !== "latest") {
          reads++;
          if (outcome === "wrong-bytes") return { ...metadata, dist: { integrity: "wrong" } };
          return outcome === "missing" || reads < (outcome === "late-converged" ? 7 : 3) ? null : metadata;
        }
        if (outcome === "newer-alias") return { ...metadata, version: "2026.10.4-pre" };
        return reads < (outcome === "late-converged" ? 7 : 3) ? { ...metadata, version: "2026.10.2-pre" } : metadata;
      };
      const result = publishPreviewSDKArtifact(artifact, expected, receipt, run, registry, async delay => { delays.push(delay); });
      if (["converged", "late-converged"].includes(outcome)) {
        expect((await result).status).toBe("published-verified");
        expect(delays).toEqual(outcome === "converged" ? [1000, 2000] : [1000, 2000, 4000, 8000, 16000, 32000]);
      } else {
        await expect(result).rejects.toThrow(outcome === "missing" ? "did not converge" : outcome === "unavailable" ? "registry unavailable" : "checked artifact");
        if (outcome === "missing") expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000]);
        else expect(delays).toEqual([]);
      }
      expect(writes).toBe(1);
    }
  });
});

test("staging uploads checked bytes once, recovers a lost ACK and rejects duplicate, malformed or changed stages", async () => {
  await fixture(async workspace => {
    const artifact = resolve(workspace, "sdk-fixture.tgz");
    const bytes = Buffer.from("synthetic unit-fixture bytes, not a release artifact");
    await writeFile(artifact, bytes);
    const expected = { name: sdkPackageNames.preview, version: "2026.10.0-pre", commit: "a".repeat(40) };
    const receipt = { ...expected, purpose: "ci-release", sha256: createHash("sha256").update(bytes).digest("hex") };
    const stage = { id: "9ab1b418-531d-41df-aa66-2f66bdde947b", packageName: expected.name,
      version: expected.version, tag: "latest", shasum: createHash("sha1").update(bytes).digest("hex") };
    let pending: unknown = [];
    let cliVersion = "11.19.0";
    let loseACK = true;
    let uploaded = 0;
    let downloadedBytes = bytes;
    const directories: string[] = [];
    const commands: string[][] = [];
    const run = (args: string[], cwd: string, capture: boolean) => {
      commands.push(args);
      expect(capture).toBe(true);
      if (args[0] === "--version") return cliVersion;
      expect(args).toContain("--registry=https://registry.npmjs.org");
      if (args[1] === "list") return JSON.stringify(pending);
      if (args[1] === "publish") {
        expect(args[2]).toBe(artifact);
        expect(args).toContain("--ignore-scripts");
        expect(args.slice(args.indexOf("--tag"), args.indexOf("--tag") + 2)).toEqual(["--tag", "latest"]);
        pending = [stage];
        uploaded++;
        if (loseACK) throw new Error("lost upload acknowledgment");
        return JSON.stringify({ [expected.name]: { name: expected.name, version: expected.version,
          stageId: stage.id, shasum: stage.shasum } });
      }
      if (args[1] === "view") return JSON.stringify(stage);
      if (args[1] === "download") {
        directories.push(cwd);
        writeFileSync(resolve(cwd, `${expected.name}-${expected.version}-${stage.id}.tgz`), downloadedBytes);
        return "{}";
      }
      throw new Error("Unexpected or destructive npm command");
    };
    expect(() => stageSDKArtifact(artifact, expected, receipt, run)).toThrow("lost upload acknowledgment");
    expect(stageSDKArtifact(artifact, expected, receipt, run)).toEqual({ ...expected, stageId: stage.id,
      tag: "latest", sha256: receipt.sha256, status: "awaiting-npm-approval", purpose: "npm-stage" });
    expect(uploaded).toBe(1);
    expect(directories.every(path => !existsSync(path))).toBe(true);
    downloadedBytes = Buffer.from("changed registry bytes");
    expect(() => stageSDKArtifact(artifact, expected, receipt, run)).toThrow("CI artifact");
    expect(directories.every(path => !existsSync(path))).toBe(true);
    for (const invalid of [{}, [null], [stage, stage], [{ ...stage, tag: "preview" }], [{ ...stage, id: "../escape" }]]) {
      pending = invalid;
      expect(() => stageSDKArtifact(artifact, expected, receipt, run)).toThrow();
    }
    cliVersion = "11.14.0";
    expect(() => stageSDKArtifact(artifact, expected, receipt, run)).toThrow("CLI 11.15.0");
    expect(() => stageSDKArtifact(artifact, expected, { ...receipt, sha256: "changed" }, run)).toThrow("CI artifact");
    cliVersion = "11.19.0";
    downloadedBytes = bytes;
    pending = [];
    loseACK = false;
    expect(stageSDKArtifact(artifact, expected, receipt, run).status).toBe("awaiting-npm-approval");
    expect(uploaded).toBe(2);
    expect(commands.every(args => !["approve", "reject"].includes(args[1]))).toBe(true);
    expect(directories.every(path => !existsSync(path))).toBe(true);
  });
});

test("registry SDK inputs require exact identity, bytes and compiled distribution contents", () => {
  const bytes = Buffer.from("fixture tarball bytes");
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const metadata = { name: "vrc-packages-api", version: "0.0.0", dist: { integrity } };
  const result = { name: metadata.name, version: metadata.version, filename: "vrc-packages-api-0.0.0.tgz",
    integrity, files: [{ path: "package.json" }, { path: "dist/index.js" }, { path: "dist/index.d.ts" }] };
  expect(() => validateRegistrySDK(result, metadata, "0.0.0", bytes)).not.toThrow();
  for (const invalid of [{ ...result, name: "other" }, { ...result, version: "0.0.1" },
    { ...result, filename: "../escape.tgz" }, { ...result, integrity: "sha512-invalid" },
    { ...result, files: [{ path: "src/index.ts" }] }]) {
    expect(() => validateRegistrySDK(invalid, metadata, "0.0.0", bytes)).toThrow("Registry SDK");
  }
  expect(() => validateRegistrySDK(result, metadata, "0.0.0", Buffer.from("changed"))).toThrow();
  expect(() => validateRegistrySDK(result, { ...metadata, dist: {} }, "0.0.0", bytes)).toThrow();
  const preview = { ...result, name: sdkPackageNames.preview, version: "2026.10.0-pre", filename: "vrc-packages-api-preview-2026.10.0-pre.tgz" };
  const previewMetadata = { ...metadata, name: preview.name, version: preview.version };
  expect(() => validateRegistrySDK(preview, previewMetadata, preview.version, bytes, sdkPackageNames.preview)).not.toThrow();
  expect(() => validateRegistrySDK(preview, previewMetadata, preview.version, bytes)).toThrow();
  expect(() => validateRegistrySDK(result, metadata, "0.0.1", bytes)).toThrow();
});

test("every CI consumer installs the published SDK while local preparation and the SDK producer stay separate", async () => {
  await fixture(async workspace => {
    // This fixture isolates SDK resolution. Hosted network source/receipt checks have their own fixtures.
    for (const product of ["worker", "crawler"]) {
      const path = resolve(workspace, productDirectories[product], "package.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      delete manifest.dependencies["vrc-packages-network"];
      await writeFile(path, JSON.stringify(manifest));
    }
    await mkdir(resolve(workspace, "scripts"));
    await mkdir(resolve(workspace, "node_modules"));
    await cp(new URL("../node_modules/semver", import.meta.url), resolve(workspace, "node_modules/semver"), { recursive: true });
    for (const file of ["delivery.mjs", "versioning.mjs", "delivery-recovery.mjs", "release-assets.mjs", "changelog.mjs"]) {
      let source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
      // Mock the external Bun process only. The real CLI still selects the product's SDK channel.
      if (file === "delivery.mjs") source = source.replace('execFileSync("bun", args,', 'execFileSync(process.execPath, [process.env.npm_execpath, ...args],');
      // This fixture isolates dependency selection. Real Git/PR source admission has separate ingress fixtures.
      if (file === "delivery.mjs") source = source.replace('if (ci) await requireCI(product, channel);', 'if (ci && channel !== "release") await requireCI(product, channel);');
      await writeFile(resolve(workspace, "scripts", file), source);
    }
    await writeFile(resolve(workspace, "package.json"), JSON.stringify({ type: "module" }));
    const networkPath = resolve(workspace, productDirectories.network, "package.json");
    const network = JSON.parse(await readFile(networkPath, "utf8"));
    await writeFile(networkPath, JSON.stringify({ ...network, name: "vrc-packages-network" }));
    const log = resolve(workspace, "commands.jsonl");
    const cli = resolve(workspace, "npm-cli.js");
    // This fake npm produces only labeled synthetic bytes inside the temporary fixture. No registry or build runs.
    await writeFile(cli, `
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const args=process.argv.slice(2), cwd=process.cwd(), env=process.env;
appendFileSync(env.FIXTURE_LOG, JSON.stringify({cwd,args})+'\\n');
const bytes=Buffer.from('synthetic registry dependency, not an actual tarball');
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
if(args[0]==='view') {
  console.log(JSON.stringify({name:env.FIXTURE_SDK_NAME,version:env.FIXTURE_LATEST||env.FIXTURE_VERSION,dist:{integrity}}));
} else if(args[0]==='pack') {
  const remote=args[1].startsWith('vrc-packages-api@')||args[1].startsWith('vrc-packages-api-preview@');
  const manifest=JSON.parse(readFileSync(join(cwd,'package.json'),'utf8'));
  const name=remote?args[1].slice(0,args[1].lastIndexOf('@')):manifest.name;
  const version=remote?args[1].slice(args[1].lastIndexOf('@')+1):manifest.version;
  const directory=args[args.indexOf('--pack-destination')+1];
  const filename=name+'-'+version+'.tgz';
  mkdirSync(directory,{recursive:true});writeFileSync(join(directory,filename),bytes);
  console.log(JSON.stringify([{name,version,filename,integrity,files:[{path:'package.json'},{path:'dist/index.js'},{path:'dist/index.d.ts'}]}]));
} else if(args[0]==='install') {
  const manifest=JSON.parse(readFileSync(join(cwd,'package.json'),'utf8'));
  for(const name of new Set([...Object.keys(manifest.dependencies||{}),...Object.keys(manifest.peerDependencies||{})])) {
    const directory=join(cwd,'node_modules',name);mkdirSync(directory,{recursive:true});
    writeFileSync(join(directory,'package.json'),JSON.stringify({name:name==='vrc-packages-api'?env.FIXTURE_SDK_NAME:name,version:env.FIXTURE_VERSION}));
  }
} else if(args[0]!=='run'||args[1]!=='build') throw new Error('Unexpected fixture npm command');
`);
    const base = { ...process.env, npm_execpath: cli, FIXTURE_LOG: log, GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push", GITHUB_SHA: "a".repeat(40) };
    const run = (args: string[], env: Record<string, string | undefined>) =>
      execFileSync(process.execPath, args, { cwd: workspace, env, stdio: "pipe", encoding: "utf8", timeout: 15_000 });
    const commands = async () => (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const prefixes = { worker: "cloudflare-worker", crawler: "vrcp-crawler", network: "vrcp-network",
      "crawler-client": "vrcp-crawler-client", web: "web" };
    for (const channel of ["release", "preview"]) {
      const version = channel === "release" ? "0.0.1" : "2026.10.1-pre";
      const env = { ...base, FIXTURE_SDK_NAME: sdkPackageNames[channel], FIXTURE_VERSION: version };
      run(["scripts/versioning.mjs", "sync", channel], env);
      for (const [product, prefix] of Object.entries(prefixes)) {
        if (product === "network" && channel === "release") continue;
        await writeFile(log, "");
        const productVersion = (await readVersionConfig(channel, workspace)).config[`${channel}-${product}`];
        const sdkChannel = sdkChannelForProduct(product, channel);
        const dependencyVersion = (await readVersionConfig(sdkChannel, workspace)).config[`${sdkChannel}-package`];
        run(["scripts/delivery.mjs", "prepare", channel, product, "--ci"], { ...env,
          FIXTURE_SDK_NAME: sdkPackageNames[sdkChannel], FIXTURE_VERSION: dependencyVersion,
          GITHUB_REF: `refs/tags/${prefix}/v${productVersion}` });
        const trace = await commands();
        expect(trace.filter(item => item.args[0] === "view").map(item => item.args[1])).toEqual([`${sdkPackageNames[sdkChannel]}@latest`]);
        expect(trace.some(item => item.cwd === resolve(workspace, productDirectories.package) && item.args[0] === "run")).toBe(false);
        expect(trace.some(item => item.args[0] === "pack" && item.args[1] === `${sdkPackageNames[sdkChannel]}@${dependencyVersion}`)).toBe(true);
        const installed = JSON.parse(await readFile(resolve(workspace, productDirectories[product], "node_modules/vrc-packages-api/package.json"), "utf8"));
        expect(installed).toEqual({ name: sdkPackageNames[sdkChannel], version: dependencyVersion });
      }
      await writeFile(log, "");
      expect(() => run(["scripts/delivery.mjs", "prepare", channel, "crawler", "--ci"], {
        ...env, FIXTURE_LATEST: "0.0.9", GITHUB_REF: `refs/tags/vrcp-crawler/v${version}`
      })).toThrow("outside the authoritative version config");
      expect((await commands()).map(item => item.args[0])).toEqual(["view"]);
      await writeFile(log, "");
      run(["scripts/delivery.mjs", "prepare", channel, "package", "--ci"], { ...env, GITHUB_REF: `refs/tags/vrcp-api/v${version}` });
      expect((await commands()).some(item => item.args[0] === "view")).toBe(false);
      await writeFile(log, "");
      run(["scripts/delivery.mjs", "prepare", channel, "crawler"], { ...env,
        FIXTURE_SDK_NAME: sdkPackageNames.preview, FIXTURE_VERSION: "2026.10.1-pre" });
      const local = await commands();
      expect(local.some(item => item.args[0] === "view")).toBe(true);
      expect(local.some(item => item.cwd === resolve(workspace, productDirectories.package) && item.args[0] === "run")).toBe(false);
    }
  });
}, 60_000);

test("real publication CLI routes preview publish and release stage through the registry helper", async () => {
  await fixture(async workspace => {
    await mkdir(resolve(workspace, "scripts"));
    await mkdir(resolve(workspace, "node_modules"));
    await cp(new URL("../node_modules/semver", import.meta.url), resolve(workspace, "node_modules/semver"), { recursive: true });
    for (const file of ["delivery.mjs", "versioning.mjs", "delivery-recovery.mjs", "release-assets.mjs", "changelog.mjs"]) {
      let source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
      // This fixture isolates registry commands. It does not pretend its synthetic SHA proves a reviewed release.
      if (file === "delivery.mjs") source = source.replace('if (ci) await requireCI(product, channel);', 'if (ci && channel !== "release") await requireCI(product, channel);');
      await writeFile(resolve(workspace, "scripts", file), source);
    }
    await writeFile(resolve(workspace, "package.json"), '{"type":"module"}');
    const cli = resolve(workspace, "npm-cli.js"), preload = resolve(workspace, "registry-fixture.mjs");
    const log = resolve(workspace, "registry-commands.jsonl"), marker = resolve(workspace, "published-marker");
    const bytes = Buffer.from("Synthetic CLI fixture bytes, not a distributed package");
    const stageId = "9ab1b418-531d-41df-aa66-2f66bdde947b";
    await writeFile(cli, `import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto'; import {join} from 'node:path';
const a=process.argv.slice(2),e=process.env;appendFileSync(e.FIXTURE_LOG,JSON.stringify(a)+'\\n');
const bytes=Buffer.from(e.FIXTURE_BYTES,'base64');
const stage={id:${JSON.stringify(stageId)},packageName:e.FIXTURE_NAME,version:e.FIXTURE_VERSION,tag:'latest',shasum:createHash('sha1').update(bytes).digest('hex')};
if(a[0]==='--version')console.log('11.19.0');
else if(a[0]==='publish'){writeFileSync(e.FIXTURE_MARKER,'published');console.log('{}');}
else if(a[0]==='stage'&&a[1]==='list')console.log('[]');
else if(a[0]==='stage'&&a[1]==='publish')console.log(JSON.stringify({[e.FIXTURE_NAME]:{stageId:stage.id,name:stage.packageName,version:stage.version,shasum:stage.shasum}}));
else if(a[0]==='stage'&&a[1]==='view')console.log(JSON.stringify(stage));
else if(a[0]==='stage'&&a[1]==='download'){writeFileSync(join(process.cwd(),e.FIXTURE_NAME+'-'+e.FIXTURE_VERSION+'-'+stage.id+'.tgz'),bytes);console.log('{}');}
else throw new Error('Unexpected registry fixture command');`);
    await writeFile(preload, `import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
globalThis.fetch=async (input,options)=>{const url=new URL(String(input)),e=process.env;
if(url.origin!=='https://registry.npmjs.org')throw new Error('Unexpected network fixture request');
if(options?.headers?.['cache-control']!=='no-cache'||options.redirect!=='error')throw new Error('Registry reads must request revalidation without redirects');
if(!existsSync(e.FIXTURE_MARKER))return new Response(null,{status:404});
return Response.json({name:e.FIXTURE_NAME,version:e.FIXTURE_VERSION,dist:{integrity:'sha512-'+createHash('sha512').update(Buffer.from(e.FIXTURE_BYTES,'base64')).digest('base64')}});};`);
    for (const channel of ["preview", "release"]) {
      const name = sdkPackageNames[channel], version = channel === "preview" ? "2026.10.1-pre" : "0.0.1";
      await versionFiles("sync", channel, "all", workspace);
      const project = resolve(workspace, productDirectories.package), directory = resolve(project, ".artifacts/ci");
      await writeFile(resolve(project, "package.json"), JSON.stringify({ name, version, private: false }));
      await mkdir(directory, { recursive: true });
      const artifact = resolve(directory, `${name}-${version}.tgz`);
      await writeFile(artifact, bytes);
      await writeFile(`${artifact}.json`, JSON.stringify({ name, version, commit: "a".repeat(40), purpose: "ci-release",
        sha256: createHash("sha256").update(bytes).digest("hex") }));
      await writeFile(log, "");
      execFileSync(process.execPath, ["--import", preload, "scripts/delivery.mjs", "publish", channel, "package", "--ci"], {
        cwd: workspace, encoding: "utf8", stdio: "pipe", timeout: 15_000,
        env: { ...process.env, npm_execpath: cli, FIXTURE_LOG: log, FIXTURE_MARKER: marker,
          FIXTURE_NAME: name, FIXTURE_VERSION: version, FIXTURE_BYTES: bytes.toString("base64"),
          GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_SHA: "a".repeat(40), GITHUB_REF: `refs/tags/vrcp-api/v${version}`,
          ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/synthetic", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-not-a-credential",
          NODE_AUTH_TOKEN: "", NPM_TOKEN: "" }
      });
      const commands = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
      const result = JSON.parse(await readFile(`${artifact}.${channel === "preview" ? "published" : "stage"}.json`, "utf8"));
      expect(result.status).toBe(channel === "preview" ? "published-verified" : "awaiting-npm-approval");
      expect(commands.some(a => a[0] === "publish")).toBe(channel === "preview");
      expect(commands.some(a => a[0] === "stage" && a[1] === "publish")).toBe(channel === "release");
      expect(commands.some(a => ["approve", "reject", "dist-tag"].includes(a[0]) || a[1] === "approve")).toBe(false);
      expect(await readFile(artifact)).toEqual(bytes);
    }
  });
});

test("consumer workflows verify their own distributions without running the SDK producer", () => {
  for (const name of ["cloudflare-worker", "node-docker", "node-client", "network"]) {
    const source = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
    expect(source).toContain("scripts/delivery.mjs prepare");
    expect(source).not.toContain("npm --prefix src-package test");
    expect(source).not.toContain("npm --prefix src-package run test:distribution");
  }
  const sdk = readFileSync(new URL("../.github/workflows/vrc-packages-api.yml", import.meta.url), "utf8");
  expect(sdk).toContain("scripts/delivery.mjs verify");
  const docker = readFileSync(new URL("../src-crawler/Dockerfile", import.meta.url), "utf8");
  expect(docker.match(/\[ "\$#" -eq 1 \]/g)).toHaveLength(2);
});

test("publication links cover internal network and both desktop channels only after checked attachments", () => {
  const network = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/network.yml", import.meta.url), "utf8"));
  const client = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/node-client.yml", import.meta.url), "utf8"));
  expect(network.jobs["deployment-record"].needs).toBe("release-assets");
  expect(network.jobs["deployment-record"].environment).toEqual({ name: "vrcp-network",
    url: "https://github.com/${{ github.repository }}/releases/tag/${{ inputs.recovery-tag || github.ref_name }}" });
  expect(client.jobs["deployment-record"]).toBeUndefined();
  const attachments = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  expect(attachments.jobs["attach-desktop"].environment.name).toContain("vrcp-crawler-client-preview");
  expect(attachments.jobs["attach-desktop"].environment.name).toContain("vrcp-crawler-client-release");
  expect(attachments.jobs["attach-desktop"].environment.url)
    .toBe("https://github.com/${{ github.repository }}/releases/tag/${{ inputs.tag || github.ref_name }}");
  expect(client.jobs.build.outputs.channel).toBe("${{ steps.route.outputs.channel }}");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(manifest.scripts["versions:bump"]).toBe(manifest.scripts["delivery:preview"].replace(" start preview", " start"));
});

test("preview App dispatcher is branch-only, serializes allocation and calls the root preview executor", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/preview-delivery.yml", import.meta.url), "utf8"));
  expect(workflow.on.push).toBeUndefined();
  expect(workflow.on.pull_request_target).toBeUndefined();
  expect(workflow.on.workflow_dispatch.inputs.product.options).toEqual(["package", "network", "crawler", "crawler-client", "worker"]);
  expect(workflow.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.allocate.permissions).toEqual({ contents: "read", actions: "read" });
  expect(workflow.jobs.allocate.env.GH_TOKEN).toBe("${{ github.token }}");
  expect(workflow.jobs.allocate.if).toBe("github.ref_type == 'branch'");
  expect(workflow.concurrency.cancel_in_progress).not.toBe(true);
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  expect(workflow.concurrency.queue).toBe("max");
  const steps = workflow.jobs.allocate.steps;
  const app = steps.find((step: any) => step.id === "app");
  const rerunGuard = steps.find((step: any) => step.name === "Reject repeated patch allocation");
  expect(steps.indexOf(rerunGuard)).toBeLessThan(steps.indexOf(app));
  expect(rerunGuard.run).toContain('if [ "$GITHUB_RUN_ATTEMPT" != "1" ]; then');
  expect(rerunGuard.run).toContain("exit 1");
  expect(rerunGuard.run).toContain("Inspect the original tag");
  expect(app.with["client-id"]).toBe("${{ vars.VRCP_PREVIEW_APP_CLIENT_ID }}");
  expect(app.with["private-key"]).toBe("${{ secrets.VRCP_PREVIEW_APP_PRIVATE_KEY }}");
  expect(app.with["permission-contents"]).toBe("write");
  const checkout = steps.find((step: any) => step.uses?.startsWith("actions/checkout@"));
  expect(checkout.with.token).toBe("${{ steps.app.outputs.token }}");
  expect(checkout.with["fetch-depth"]).toBe(0);
  expect(checkout.with.ref).toBe("${{ github.ref_name }}");
  const command = steps.find((step: any) => step.name === "Allocate one configured patch and queue tagged delivery");
  expect(command.run).toBe('bun run delivery:preview "$VRCP_PREVIEW_PRODUCT" --execute');
  expect(command.env.VRCP_PREVIEW_PRODUCT).toBe("${{ inputs.product }}");
  expect(JSON.stringify(steps)).not.toContain("delivery:release");
  expect(JSON.stringify(steps)).not.toContain("pulls/");
});

test("tagged builds and asset retries retain pending work without blocking preview behind release review", () => {
  for (const [file, group] of [
    ["vrc-packages-api", "sdk"], ["node-docker", "crawler"], ["cloudflare-worker", "worker"]
  ]) {
    const workflow = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${file}.yml`, import.meta.url), "utf8"));
    expect(workflow.concurrency.queue).toBe("max");
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
    expect(workflow.concurrency.group).toBe(`${group}-` + "${{ contains(github.ref_name, '-pre') && 'preview' || 'release' }}");
  }
  const assets = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  expect(assets.concurrency.queue).toBe("max");
  expect(assets.concurrency["cancel-in-progress"]).toBe(false);
  expect(assets.concurrency.group).toBe("release-assets-${{ inputs.tag || github.ref_name }}");
  // These builds had no concurrency cancellation group. Do not introduce an unrelated queue.
  for (const file of ["node-client", "network"]) {
    const workflow = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${file}.yml`, import.meta.url), "utf8"));
    expect(workflow.concurrency).toBeUndefined();
  }
});

test("external workflow guards separate the two npm approvals from preview-only Worker authority", () => {
  const workflow = (name: string) => Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8")) as {
    jobs: Record<string, { if?: string | boolean; environment?: string; steps?: { env?: Record<string, string>; with?: { path?: string } }[] }>;
  };
  const sdk = workflow("vrc-packages-api").jobs.publish;
  expect(sdk?.if).toContain("needs.build.outputs.channel == 'release'");
  expect(sdk?.if).toContain("needs.build.outputs.channel == 'preview'");
  expect(sdk?.if).not.toContain("VRCP_SDK_PREVIEW_PUBLISH_APPROVED");
  expect(sdk?.if).toContain("vars.VRCP_SDK_PUBLISH_APPROVED == 'true'");
  expect(sdk.environment).toEqual({ name: '${{ needs.build.outputs.environment }}',
    url: "https://www.npmjs.com/package/${{ needs.build.outputs.channel == 'preview' && 'vrc-packages-api-preview' || 'vrc-packages-api' }}" });
  const auth = sdk?.steps?.find(step => step.env?.NODE_AUTH_TOKEN)?.env;
  expect(auth?.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
  expect(auth?.NPM_TOKEN).toBe(auth?.NODE_AUTH_TOKEN);
  expect(workflow("cloudflare-worker").jobs.deploy?.if).toContain("needs.build.outputs.channel == 'preview'");
  expect(workflow("cloudflare-worker").jobs.deploy?.if).not.toContain("VRCP_WORKER_DEPLOY_APPROVED");
  expect(workflow("cloudflare-worker").jobs.deploy?.steps?.find(step => step.env?.OPERATOR_TOKEN)?.env?.OPERATOR_TOKEN)
    .toBe('${{ secrets.OPERATOR_TOKEN }}');
  expect(existsSync(new URL("../.github/workflows/web.yml", import.meta.url))).toBe(false);
  const clientArtifact = workflow("node-client").jobs.build?.steps?.find(step => step.with?.path)?.with?.path;
  expect(clientArtifact).toContain("/bundle/msi/*.msi");
  expect(clientArtifact).toContain("/bundle/nsis/*-setup.exe");
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(root.scripts.setup).toBe("bun install --no-save --ignore-scripts");
  expect(readFileSync(new URL("../.github/workflows/vrc-packages-api.yml", import.meta.url), "utf8"))
    .toContain("group: sdk-${{ contains(github.ref_name, '-pre') && 'preview' || 'release' }}");
});

test("Worker artifact paths follow runtime channel independently of GitHub approval-environment names", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/cloudflare-worker.yml", import.meta.url), "utf8")) as {
    jobs: Record<string, { environment?: string; steps: { uses?: string; with?: { path?: string } }[] }>;
  };
  const upload = workflow.jobs.build.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"))?.with?.path;
  const download = workflow.jobs.deploy.steps.find(step => step.uses?.startsWith("actions/download-artifact@"))?.with?.path;
  expect(upload).toContain("steps.route.outputs.channel == 'preview' && 'preview' || 'production'");
  expect(download).toContain("needs.build.outputs.channel == 'preview' && 'preview' || 'production'");
  expect(upload).not.toContain("outputs.environment");
  expect(download).not.toContain("outputs.environment");
  expect(workflow.jobs.deploy.environment).toBe('${{ needs.build.outputs.environment }}');
});

test("Worker deploy tooling has its own manifest before Bun install and cannot resolve a parent project", async () => {
  const workflow: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/cloudflare-worker.yml", import.meta.url), "utf8"));
  const command = workflow.jobs.deploy.steps.find((step: any) => step.name === "Install pinned deployment tool only").run;
  const source = /node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\n/.exec(command)?.[1];
  expect(source).toBeDefined();
  expect(command.indexOf("writeFileSync")).toBeLessThan(command.indexOf("bun install --cwd"));
  expect(command).not.toContain("wrangler@4.");
  expect(command).toContain("test -f src-worker/.wrangler/ci-tools/node_modules/wrangler/bin/wrangler.js");
  for (const pin of ["4.147.0", "^4.147.0", "latest", undefined]) {
    await fixture(async workspace => {
      await mkdir(resolve(workspace, "src-worker/.wrangler/ci-tools"), { recursive: true });
      await writeFile(resolve(workspace, "src-worker/package.json"), JSON.stringify({ private: true,
        packageManager: "bun@1.4.2", devDependencies: { wrangler: pin }, dependencies: { "must-not-install": "1.0.0" } }));
      const run = () => execFileSync(process.execPath, ["--input-type=module", "-e", source!], { cwd: workspace, stdio: "pipe" });
      const path = resolve(workspace, "src-worker/.wrangler/ci-tools/package.json");
      if (pin === "4.147.0") {
        run();
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ private: true, packageManager: "bun@1.4.2",
          dependencies: { wrangler: pin } });
        expect(run).toThrow();
        expect(JSON.parse(await readFile(path, "utf8")).dependencies).toEqual({ wrangler: pin });
      } else { expect(run).toThrow(); expect(existsSync(path)).toBe(false); }
    });
  }
});

test("preview deployment accepts only the operator binding and rejects missing or malformed secrets", () => {
  const token = randomBytes(32).toString("hex");
  expect(workerSecretBindings({ OPERATOR_TOKEN: token, NPM_TOKEN: "unrelated" })).toEqual({ OPERATOR_TOKEN: token });
  for (const env of [{}, { OPERATOR_TOKEN: "short" }, { OPERATOR_TOKEN: "g".repeat(64) }]) {
    expect(() => workerSecretBindings(env)).toThrow("64-hex OPERATOR_TOKEN");
  }
});

test("hidden-directory uploads include only runtime artifacts and their CI receipts", () => {
  for (const [name, suffixes] of [
    ["cloudflare-worker", ["/worker_entry.js", "/worker_entry.js.json"]],
    ["vrc-packages-api", ["/*.tgz", "/*.tgz.json"]],
    ["network", ["/*.tgz", "/*.tgz.json"]]
  ] as const) {
    const workflow = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8")) as {
      jobs: { build: { steps: { uses?: string; with?: { path?: string; "include-hidden-files"?: boolean } }[] } };
    };
    const upload = workflow.jobs.build.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"))?.with;
    expect(upload?.["include-hidden-files"]).toBe(true);
    const paths = upload?.path?.trim().split("\n") ?? [];
    expect(paths).toHaveLength(2);
    for (let index = 0; index < suffixes.length; index++) expect(paths[index].endsWith(suffixes[index])).toBe(true);
    expect(paths.every(path => !path.includes("node_modules") && !path.endsWith("/"))).toBe(true);
  }
});
