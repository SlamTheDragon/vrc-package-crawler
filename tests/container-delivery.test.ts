import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveDigest, checkContainerReceipt, checkImage, imageLabels, publishCheckedImage, registryMissing, requireContainerApproval } from "../scripts/container-delivery.mjs";

test("preview needs no approval variables while release retains both approvals", () => {
  expect(() => requireContainerApproval("preview", {})).not.toThrow();
  expect(() => requireContainerApproval("preview", { VRCP_CONTAINER_PUBLISH_APPROVED: "false" })).not.toThrow();
  for (const env of [{}, { VRCP_CONTAINER_PUBLISH_APPROVED: "true" }, { VRCP_CRAWLER_RELEASE_PUBLISH_APPROVED: "true" }]) {
    expect(() => requireContainerApproval("release", env)).toThrow("approval");
  }
  expect(() => requireContainerApproval("release", { VRCP_CONTAINER_PUBLISH_APPROVED: "true", VRCP_CRAWLER_RELEASE_PUBLISH_APPROVED: "true" })).not.toThrow();
  expect(() => requireContainerApproval("unknown", {})).toThrow("Unknown");
});

const id = "sha256:" + "a".repeat(64);
const otherId = "sha256:" + "b".repeat(64);
const expected = { product: "crawler", channel: "preview", version: "2026.10.2-pre", commit: "c".repeat(40),
  repository: "Owner/Repo", sdkName: "vrc-packages-api-preview", sdkVersion: "2026.10.3-pre", networkVersion: "2026.10.4-pre" };
const image = () => ({ Id: id, Os: "linux", Architecture: "amd64", Config: { User: "vrcpuser", WorkingDir: "/app/data",
  Entrypoint: ["/app/vrcp-crawler-node"], Volumes: { "/app/data": {} }, Labels: imageLabels(expected) } });
const receipt = { ...expected, purpose: "ci-container", archive: "container.tar", imageId: id, size: 10, sha256: "d".repeat(64) };
const manifest = (digest: string) => JSON.stringify({ schemaVersion: 2, config: { digest }, layers: [{ digest: otherId }] });

test("container image checks bind runtime and independently configured dependency identities", () => {
  expect(checkImage(image(), expected)).toBe(id);
  for (const altered of [{ ...image(), Id: "invalid" }, { ...image(), Architecture: "arm64" },
    { ...image(), Config: { ...image().Config, User: "root" } }, { ...image(), Config: { ...image().Config, Volumes: {} } },
    { ...image(), Config: { ...image().Config, Entrypoint: ["sh"] } }]) {
    expect(() => checkImage(altered, expected)).toThrow();
  }
  for (const key of Object.keys(imageLabels(expected))) {
    expect(() => checkImage({ ...image(), Config: { ...image().Config, Labels: { ...image().Config.Labels, [key]: "changed" } } }, expected)).toThrow("label");
  }
});

test("container receipt rejects wrong bytes, channels, dependencies, commits and repositories", () => {
  expect(() => checkContainerReceipt(receipt, expected, receipt.sha256, receipt.size)).not.toThrow();
  for (const key of Object.keys(expected)) {
    expect(() => checkContainerReceipt({ ...receipt, [key]: "wrong" }, expected, receipt.sha256, receipt.size)).toThrow();
  }
  expect(() => checkContainerReceipt(receipt, expected, "e".repeat(64), 10)).toThrow("bytes");
  expect(() => checkContainerReceipt(receipt, expected, receipt.sha256, 11)).toThrow("bytes");
  expect(() => checkContainerReceipt({ ...receipt, archive: "../other.tar" }, expected, receipt.sha256, 10)).toThrow("invalid");
  expect(() => checkContainerReceipt({ ...receipt, imageId: "invalid" }, expected, receipt.sha256, 10)).toThrow("invalid");
});

test("archive digest streams synthetic fixture bytes and detects later changes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vrcp-container-unit-"));
  try {
    const path = join(directory, "synthetic-not-an-image");
    writeFileSync(path, "synthetic unit fixture");
    const bytes = readFileSync(path);
    expect(await archiveDigest(path)).toEqual({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    writeFileSync(path, "changed synthetic fixture");
    expect((await archiveDigest(path)).sha256).not.toBe(createHash("sha256").update(bytes).digest("hex"));
    await expect(archiveDigest(directory)).rejects.toThrow("regular file");
  } finally { rmSync(directory, { recursive: true }); }
});

test("only explicit missing manifests count as absence, never denied access or network failure", () => {
  const ref = "ghcr.io/owner/vrcp-crawler-node-preview:2026.10.2-pre";
  for (const error of ["manifest unknown", "name unknown", `ERROR: ${ref}: not found`]) expect(registryMissing(error, ref)).toBe(true);
  for (const error of ["unauthorized", "denied", "dial timeout", "500 Internal Server Error", "ERROR: other: not found",
    "transport failure: manifest unknown", "unexpected status 403 Forbidden", "not found"]) expect(registryMissing(error, ref)).toBe(false);
});

function registry(version?: string, alias?: string, aliasVersion = "2026.10.1-pre", incorrectPush = false) {
  const states = new Map<string, string>();
  const calls: string[][] = [];
  const image = "ghcr.io/owner/vrcp-crawler-node-preview";
  if (version) states.set(`${image}:${expected.version}`, version);
  if (alias) states.set(`${image}:latest`, alias);
  const run = (args: string[]) => {
    calls.push(args);
    const ref = args.at(-1)!;
    if (args.includes("--raw")) return states.has(ref) ? manifest(states.get(ref)!) : null;
    if (args.includes("{{json .Image}}")) return JSON.stringify({ config: { Labels: { ...imageLabels(expected), "org.opencontainers.image.version": aliasVersion } } });
    if (args.includes("{{.Manifest.Digest}}")) return otherId;
    if (args[0] === "push") states.set(ref, incorrectPush ? otherId : id);
    else if (args[0] !== "tag") throw new Error("Unexpected fake Docker command");
    return "";
  };
  return { run, calls, states };
}

test("preview publication pushes version and latest to the separate package without a rebuild", () => {
  const fake = registry();
  const result = publishCheckedImage(expected, receipt, fake.run);
  expect(result.image).toBe("ghcr.io/owner/vrcp-crawler-node-preview");
  expect(result.immutableRef).toBe(`ghcr.io/owner/vrcp-crawler-node-preview@${otherId}`);
  expect(fake.calls.filter(args => args[0] === "push").map(args => args[1])).toEqual([
    `ghcr.io/owner/vrcp-crawler-node-preview:${expected.version}`, "ghcr.io/owner/vrcp-crawler-node-preview:latest"]);
  expect(fake.calls.some(args => args.includes("build"))).toBe(false);
});

test("release publication cannot select preview package names", () => {
  const calls: string[][] = [];
  const run = (args: string[]) => {
    calls.push(args);
    if (args.includes("--raw")) return manifest(id);
    return otherId;
  };
  const release = { ...expected, channel: "release", version: "0.0.2", sdkName: "vrc-packages-api", sdkVersion: "0.0.3", networkVersion: "0.0.4" };
  expect(publishCheckedImage(release, { ...receipt, ...release }, run).image).toBe("ghcr.io/owner/vrcp-crawler-node");
  expect(calls.some(args => args.some(value => value.includes("-preview")))).toBe(false);
});

test("same-byte publication retries make no writes, and differing version bytes fail before writes", () => {
  const retry = registry(id, id);
  publishCheckedImage(expected, receipt, retry.run);
  expect(retry.calls.some(args => ["tag", "push"].includes(args[0]))).toBe(false);
  const conflict = registry(otherId);
  expect(() => publishCheckedImage(expected, receipt, conflict.run)).toThrow("immutable");
  expect(conflict.calls.some(args => ["tag", "push"].includes(args[0]))).toBe(false);
});

test("latest advances only from an older reviewed image, never rolls back on retry", () => {
  const advance = registry(undefined, otherId);
  publishCheckedImage(expected, receipt, advance.run);
  expect(advance.calls.filter(args => args[0] === "push")).toHaveLength(2);
  for (const version of [expected.version, "2026.10.9-pre", "invalid"]) {
    const fake = registry(id, otherId, version);
    expect(() => publishCheckedImage(expected, receipt, fake.run)).toThrow("roll latest back");
    expect(fake.calls.some(args => ["tag", "push"].includes(args[0]))).toBe(false);
  }
});

test("publication stops if readback differs, and cannot treat a manifest list as the checked image", () => {
  const fake = registry(undefined, undefined, undefined, true);
  expect(() => publishCheckedImage(expected, receipt, fake.run)).toThrow("differs from checked");
  expect(fake.calls.filter(args => args[0] === "push")).toHaveLength(1);
  expect(() => publishCheckedImage(expected, receipt, () => JSON.stringify({ schemaVersion: 2, manifests: [] }))).toThrow("single-platform");
});

test("repository rename accepts only the exact two published patch-0 latest images", () => {
  for (const channel of ["preview", "release"] as const) {
    const oldVersion = channel === "preview" ? "2026.10.0-pre" : "0.0.0";
    const oldDigest = channel === "preview"
      ? "sha256:29d1c6940253dee085fbc14bacef01ae23e991bb55a78fcdc084082a60993035"
      : "sha256:8c7723e19689ec23eb6e95774ec22205e36d16375b12468313214fd97ec3c215";
    const selected = { ...expected, repository: "SlamTheDragon/vrc-packages", channel,
      version: channel === "preview" ? "2026.10.1-pre" : "0.0.1" };
    const baseline = { ...imageLabels(selected), "org.opencontainers.image.version": oldVersion,
      "org.opencontainers.image.source": "https://github.com/SlamTheDragon/vrc-package-crawler",
      "org.opencontainers.image.revision": "fb9edf66ce1b9954bd672826a3090c735b60632d" };
    for (const alteration of [{}, { "org.opencontainers.image.source": "https://github.com/Other/vrc-package-crawler" },
      { "org.opencontainers.image.version": selected.version }, { "org.opencontainers.image.revision": "e".repeat(40) },
      { "io.vrcp.channel": channel === "preview" ? "release" : "preview" }, { digest: otherId }]) {
      let writes = 0;
      const labels = { ...baseline, ...alteration };
      const run = (args: string[]) => {
        if (args.includes("{{json .Image}}")) return JSON.stringify({ config: { Labels: labels } });
        if (args.includes("{{.Manifest.Digest}}")) return otherId;
        if (args.includes("--raw")) return args.at(-1)!.endsWith(":latest") && writes === 0
          ? manifest("digest" in alteration ? alteration.digest! : oldDigest)
          : writes ? manifest(id) : null;
        if (args[0] === "push") writes++;
        return "";
      };
      if (Object.keys(alteration).length === 0) {
        expect(publishCheckedImage(selected, receipt, run).repository).toBe(selected.repository);
        expect(writes).toBe(2);
      } else {
        expect(() => publishCheckedImage(selected, receipt, run)).toThrow();
        expect(writes).toBe(0);
      }
    }
    expect(() => checkImage({ ...image(), Config: { ...image().Config, Labels: baseline } }, selected)).toThrow("label");
  }
});

test("Docker workflow has one read-only image build and a protected, channel-gated archive publication", () => {
  const workflow: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/node-docker.yml", import.meta.url), "utf8"));
  expect(workflow.permissions).toEqual({ contents: "read", actions: "read", "pull-requests": "read" });
  const build = workflow.jobs["build-linux"];
  expect(build.permissions).toEqual({ contents: "read", actions: "read", "pull-requests": "read" });
  const prepare = build.steps.find((step: any) => step.run?.includes("delivery.mjs prepare"));
  expect(prepare.env.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  expect(build.environment).toBeUndefined();
  expect(build.steps.filter((step: any) => step.uses?.startsWith("docker/build-push-action@"))).toHaveLength(1);
  expect(build.steps.some((step: any) => step.uses?.startsWith("docker/login-action@"))).toBe(false);
  const imageBuild = build.steps.find((step: any) => step.uses?.startsWith("docker/build-push-action@"));
  expect(imageBuild.with.platforms).toBe("linux/amd64");
  expect(imageBuild.with["build-args"]).toContain("needs.route.outputs.channel");
  expect(imageBuild.with["build-args"]).toContain("dependencies.outputs.sdk-version");
  expect(imageBuild.with["build-args"]).toContain("dependencies.outputs.network-version");
  expect(imageBuild.with.push).toBeUndefined();
  expect(imageBuild.env.DOCKER_BUILD_RECORD_UPLOAD).toBe(false);
  const dockerfile = readFileSync(new URL("../src-crawler/Dockerfile", import.meta.url), "utf8");
  expect(dockerfile).toContain('"vrc-packages-network@file:$1"');
  const publish = workflow.jobs["publish-container"];
  expect(publish.permissions).toEqual({ contents: "read", actions: "read", packages: "write", "pull-requests": "read" });
  expect(publish.if).not.toContain("VRCP_CRAWLER_PREVIEW_PUBLISH_APPROVED");
  expect(publish.if).toContain("VRCP_CRAWLER_RELEASE_PUBLISH_APPROVED");
  expect(publish.environment.name).toContain("vrcp-crawler-preview");
  expect(publish.environment.name).toContain("vrcp-crawler-release");
  expect(publish.environment.url).toBe("https://github.com/${{ github.repository }}/releases/tag/${{ inputs.recovery-tag || github.ref_name }}");
  expect(publish.steps.some((step: any) => step.uses?.startsWith("docker/build-push-action@"))).toBe(false);
  const load = publish.steps.findIndex((step: any) => step.run?.includes("container-delivery.mjs load"));
  const login = publish.steps.findIndex((step: any) => step.uses?.startsWith("docker/login-action@"));
  expect(load).toBeGreaterThan(-1);
  expect(login).toBeGreaterThan(load);
  expect(workflow.jobs["release-assets"].needs).toContain("publish-container");
  expect(workflow.jobs["release-assets"].if).toContain("needs.publish-container.result == 'success'");
  const attachments: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  expect(attachments.jobs.attach.steps.find((step: any) => step.uses?.startsWith("actions/download-artifact@")).with.pattern).toBe("!ci-only-*");
});
