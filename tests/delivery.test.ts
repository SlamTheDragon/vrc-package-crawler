import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { bumpVersion, distributedArtifact, productDirectories, readVersionConfig, sdkPackageNames, versionFiles } from "../scripts/versioning.mjs";
import { checkSDKPublicationVersion, deliver, requireCI, resolveTag, validateCIArtifact, validateRegistrySDK, workerSecretBindings } from "../scripts/delivery.mjs";

async function fixture(run: (workspace: string) => Promise<void>) {
  const parent = await realpath(tmpdir());
  const workspace = await mkdtemp(resolve(parent, "vrcp-delivery-"));
  try {
    for (const channel of ["release", "preview"]) {
      const config = Object.fromEntries(Object.keys(productDirectories).map(name =>
        [`${channel}-${name}`, channel === "release" ? "0.0.1" : "0.0.1-pre.1"]));
      await writeFile(resolve(workspace, channel === "release" ? "config.versions.json" : "config.preview.versions.json"), JSON.stringify(config));
    }
    for (const [name, path] of Object.entries(productDirectories)) {
      await mkdir(resolve(workspace, path), { recursive: true });
      const dependencies = name === "package" ? {} : { "vrc-packages-api": "0.0.1" };
      if (["crawler", "worker"].includes(name)) dependencies["vrc-packages-network"] = "0.0.1";
      await writeFile(resolve(workspace, path, "package.json"), JSON.stringify({ name, version: "0.0.1", dependencies }));
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
    expect(await resolveTag("worker/v0.0.1-pre.1", workspace)).toEqual({
      product: "worker", version: "0.0.1-pre.1", channel: "preview", environment: "preview"
    });
    expect((await resolveTag("web/v0.0.1", workspace)).environment).toBe("production");
    expect((await resolveTag("package/v0.0.1-pre.1", workspace)).environment).toBe("npm-preview");
    expect((await resolveTag("package/v0.0.1", workspace)).environment).toBe("production");
    for (const tag of ["v0.0.1", "main", "worker/v0.0.2", "worker/v01.0.1", "unknown/v0.0.1", "worker/v0.0.1\n"]) {
      await expect(resolveTag(tag, workspace)).rejects.toThrow();
    }
  });
});

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

test("selected-product sync pins distributed dependencies without changing another product", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-crawler/package.json"), "utf8");
    await versionFiles("sync", "preview", "worker", workspace);
    const worker = JSON.parse(await readFile(resolve(workspace, "src-worker/package.json"), "utf8"));
    expect(worker.version).toBe("0.0.1-pre.1");
    expect(worker.dependencies).toEqual({ "vrc-packages-api": "npm:vrc-package-api-preview@0.0.1-pre.1", "vrc-packages-network": "0.0.1-pre.1" });
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
    expect(sdk.version).toBe("0.0.1-pre.1");
    expect(await readFile(resolve(workspace, "src-crawler-client/src-tauri/Cargo.toml"), "utf8"))
      .toContain('version = "0.0.1-pre.1" # retain owner note');
    await versionFiles("sync", "release", "all", workspace);
    await versionFiles("check", "release", "all", workspace);
    expect(JSON.parse(await readFile(resolve(workspace, "src-package/package.json"), "utf8")).name).toBe(sdkPackageNames.release);
    expect(JSON.parse(await readFile(resolve(workspace, "src-worker/package.json"), "utf8")).dependencies["vrc-packages-api"]).toBe("latest");
    expect(JSON.parse(await readFile(resolve(workspace, "src-crawler/package.json"), "utf8")).dependencies["vrc-packages-api"]).toBe("0.0.1");
  });
});

test("bump changes only one authoritative config value, not local metadata or external state", async () => {
  await fixture(async workspace => {
    const before = await readFile(resolve(workspace, "src-worker/package.json"), "utf8");
    expect((await bumpVersion("preview", "worker", "pre", workspace)).version).toBe("0.0.1-pre.2");
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
  for (const env of [{}, { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/tags/worker/v0.0.0" },
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
  expect(distributedArtifact("vrc-packages-api", "latest", "0.0.0")).toEqual({ name: sdkPackageNames.release, version: "0.0.0" });
  expect(distributedArtifact("vrc-packages-api", "npm:vrc-package-api-preview@2026.10.0-pre")).toEqual({ name: sdkPackageNames.preview, version: "2026.10.0-pre" });
  expect(distributedArtifact("vrc-packages-network", "0.0.0")).toEqual({ name: "vrc-packages-network", version: "0.0.0" });
  for (const [name, spec] of [["vrc-packages-api", "latest"], ["vrc-packages-network", "latest"],
    ["vrc-packages-api", "npm:unapproved@0.0.0"], ["vrc-packages-api", "npm:vrc-package-api-preview@pre"],
    ["vrc-packages-api", "^0.0.0"], ["vrc-packages-api", "file:../src-package"], ["unknown", "0.0.0"]]) {
    expect(() => distributedArtifact(name, spec)).toThrow("Distributed dependency");
  }
});

test("packed consumer declarations are checked in installed consumers, not through package self-reference", () => {
  const config = JSON.parse(readFileSync(new URL("../src-package/tsconfig.json", import.meta.url), "utf8"));
  expect(config.exclude).toContain("tests/fixtures");
  const harness = readFileSync(new URL("../src-package/tests/distribution_smoke.mjs", import.meta.url), "utf8");
  expect(harness).toContain("'--noEmit', '--strict'");
  expect(harness).toContain("'consumer.mts'");
  expect(harness).toContain("`vrc-packages-api@file:${tarball}`");
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
  const env = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: `refs/tags/worker/v${config["release-worker"]}` };
  for (const commit of [undefined, "", "short", "g".repeat(40)]) {
    await expect(requireCI("worker", "release", { ...env, GITHUB_SHA: commit })).rejects.toThrow("tag-push");
  }
  expect((await requireCI("worker", "release", { ...env, GITHUB_SHA: "a".repeat(40) })).product).toBe("worker");
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
  const preview = { ...result, name: sdkPackageNames.preview, version: "2026.10.0-pre", filename: "vrc-package-api-preview-2026.10.0-pre.tgz" };
  const previewMetadata = { ...metadata, name: preview.name, version: preview.version };
  expect(() => validateRegistrySDK(preview, previewMetadata, preview.version, bytes, sdkPackageNames.preview)).not.toThrow();
  expect(() => validateRegistrySDK(preview, previewMetadata, preview.version, bytes)).toThrow();
  expect(() => validateRegistrySDK(result, metadata, "0.0.1", bytes)).toThrow();
});

test("external workflow guards separate the two npm approvals from preview-only Worker authority", () => {
  const workflow = (name: string) => Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8")) as {
    jobs: Record<string, { if?: string | boolean; environment?: string; steps?: { env?: Record<string, string>; with?: { path?: string } }[] }>;
  };
  const sdk = workflow("vrc-packages-api").jobs.publish;
  expect(sdk?.if).toContain("needs.build.outputs.channel == 'release'");
  expect(sdk?.if).toContain("needs.build.outputs.channel == 'preview'");
  expect(sdk?.if).toContain("vars.VRCP_SDK_PREVIEW_PUBLISH_APPROVED == 'true'");
  expect(sdk.environment).toBe('${{ needs.build.outputs.environment }}');
  const auth = sdk?.steps?.find(step => step.env?.NODE_AUTH_TOKEN)?.env;
  expect(auth?.NODE_AUTH_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
  expect(auth?.NPM_TOKEN).toBe(auth?.NODE_AUTH_TOKEN);
  expect(workflow("worker").jobs.deploy?.if).toContain("needs.build.outputs.channel == 'preview'");
  expect(workflow("worker").jobs.deploy?.steps?.find(step => step.env?.OPERATOR_TOKEN)?.env?.OPERATOR_TOKEN)
    .toBe('${{ secrets.OPERATOR_TOKEN }}');
  expect(workflow("web").jobs.build?.if).toBe(false);
  const clientArtifact = workflow("node-client").jobs.build?.steps?.find(step => step.with?.path)?.with?.path;
  expect(clientArtifact).toContain("/bundle/msi/*.msi");
  expect(clientArtifact).toContain("/bundle/nsis/*-setup.exe");
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(root.scripts.setup).toContain("--package-lock=false");
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
    ["worker", ["/worker_entry.js", "/worker_entry.js.json"]],
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
