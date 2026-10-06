import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { allowedBinary, attachRelease as attachNamedRelease, checkedAssets, checkedAssetBytes, checkSourceRun, checkRemoteTag, sourceRunID, sameSourceRunLink, milestoneNotes, reconcileSDKDrafts, releaseSummary } from "../scripts/release-assets.mjs";
import { readVersionConfig } from "../scripts/versioning.mjs";

const commit = "a".repeat(40);
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const selected = { product: "package", version: "2026.10.0-pre", channel: "preview" };
const attachRelease = (api: any, repository: string, tag: string, sourceCommit: string, notes: string,
  files: Map<string, Buffer>, draft: boolean, prerelease: boolean) =>
  attachNamedRelease(api, repository, tag, sourceCommit, notes, files, draft, prerelease, "vrc-packages-api");

test("repository rename retains original run links but never accepts another owner, run or redirect target", () => {
  const repository = "SlamTheDragon/vrc-packages", current = `https://github.com/${repository}/actions/runs/123`;
  const previous = "https://github.com/SlamTheDragon/vrc-package-crawler/actions/runs/123";
  expect(sourceRunID(previous, repository)).toBe("123");
  expect(sameSourceRunLink(`[Checked CI run](${previous})`, current, repository)).toBe(true);
  expect(sameSourceRunLink(`[Checked CI run](${previous}4)`, current, repository)).toBe(false);
  for (const link of [previous.replace("SlamTheDragon", "attacker"), previous.replace("github.com", "evil.invalid"),
    `${previous}?redirect=evil`, `${previous}#fragment`, `${previous}/logs`, previous.replace("/123", "/00123")]) {
    expect(() => sourceRunID(link, repository)).toThrow();
  }
  expect(() => sourceRunID(previous, "example/fixture")).toThrow();
});

test("remote tag binding rejects moved, malformed and cyclic refs while accepting fixed annotated or lightweight tags", async () => {
  const tag = "vrcp-api/v0.0.0", oid = "b".repeat(40);
  let ref = { ref: `refs/tags/${tag}`, object: { type: "tag", sha: oid } };
  let annotation = { sha: oid, object: { type: "commit", sha: commit } };
  let calls = 0;
  const api = async (method: string, path: string) => { expect(method).toBe("GET"); calls++;
    return path.includes("/git/ref/") ? ref : annotation; };
  expect(await checkRemoteTag(api, "owner/repo", tag, commit, oid)).toEqual({ tagObject: oid, commit });
  await expect(checkRemoteTag(api, "owner/repo", tag, commit, "c".repeat(40))).rejects.toThrow("tag object differs");
  annotation.object.sha = "c".repeat(40);
  await expect(checkRemoteTag(api, "owner/repo", tag, commit)).rejects.toThrow("source commit");
  annotation.object.sha = commit;
  annotation.sha = "d".repeat(40);
  await expect(checkRemoteTag(api, "owner/repo", tag, commit)).rejects.toThrow("annotated tag object");
  annotation.sha = oid;
  for (const malformed of [{}, { ref: "refs/heads/main", object: ref.object },
    { ref: ref.ref, object: { type: "blob", sha: oid } }, { ref: ref.ref, object: { type: "tag", sha: "../escape" } }]) {
    const invalid = async () => malformed;
    await expect(checkRemoteTag(invalid, "owner/repo", tag, commit)).rejects.toThrow("Invalid remote tag binding");
  }
  annotation.object = { type: "tag", sha: oid }; calls = 0;
  await expect(checkRemoteTag(api, "owner/repo", tag, commit)).rejects.toThrow("chain exceeds");
  expect(calls).toBe(5);
  ref = { ref: `refs/tags/${tag}`, object: { type: "commit", sha: commit } };
  expect(await checkRemoteTag(api, "owner/repo", tag, commit, commit)).toEqual({ tagObject: commit, commit });
});

function fixture(files: Record<string, string | Buffer>, inspect: (paths: string[]) => void) {
  const directory = mkdtempSync(join(tmpdir(), "vrcp-release-unit-"));
  try {
    const paths = Object.entries(files).map(([name, bytes]) => { const path = join(directory, name); writeFileSync(path, bytes); return path; });
    inspect(paths);
  } finally { rmSync(directory, { recursive: true }); }
}

test("SDK attachments require original CI bytes and identity, not a build-directory dump", () => {
  const name = "vrc-packages-api-preview-2026.10.0-pre.tgz";
  const bytes = Buffer.from("synthetic unit data, not a release tarball");
  const receipt = { name: "vrc-packages-api-preview", version: selected.version, commit, purpose: "ci-release", sha256: digest(bytes) };
  const files = { [name]: bytes, [`${name}.json`]: JSON.stringify(receipt) };
  fixture(files, paths => {
    expect(checkedAssets(paths, selected, commit, {}, undefined).size).toBe(2);
    expect(() => checkedAssets([...paths, paths[0]], selected, commit, {}, undefined)).toThrow("Duplicate");
    expect(() => checkedAssets(paths.slice(0, 1), selected, commit, {}, undefined)).toThrow("Missing");
    expect(() => checkedAssets(paths, selected, "b".repeat(40), {}, undefined)).toThrow("CI artifact");
  });
  fixture({ ...files, [name]: "changed" }, paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("CI artifact"));
  fixture({ ...files, ".env": "synthetic, not a secret" }, paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("Unexpected"));
  fixture({ ...files, [`${name}.stage.json`]: JSON.stringify({ ...receipt, channel: "preview", purpose: "npm-stage",
    stageId: "00000000-0000-0000-0000-000000000001", tag: "latest", status: "awaiting-npm-approval" }) },
    paths => expect(checkedAssets(paths, selected, commit, {}, undefined).size).toBe(3));
  fixture({ ...files, [`${name}.stage.json`]: JSON.stringify({ ...receipt, purpose: "npm-stage", channel: "release" }) },
    paths => expect(() => checkedAssets(paths, selected, commit, {}, undefined)).toThrow("stage receipt"));
  const publication = { ...receipt, channel: "preview", purpose: "npm-publication", tag: "latest", status: "published-verified",
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` };
  fixture({ ...files, [`${name}.published.json`]: JSON.stringify(publication) },
    paths => expect(checkedAssets(paths, selected, commit, {}).size).toBe(3));
  for (const invalid of [{ ...publication, sha256: "changed" }, { ...publication, channel: "release" },
    { ...publication, integrity: "changed" }, { ...publication, status: "pending" }, { ...publication, commit: "b".repeat(40) }]) {
    fixture({ ...files, [`${name}.published.json`]: JSON.stringify(invalid) },
      paths => expect(() => checkedAssets(paths, selected, commit, {})).toThrow("publication receipt"));
  }
});

test("Worker bundles cannot become GitHub Release assets", () => {
  const worker = { product: "worker", version: "2026.10.0-pre", channel: "preview" };
  expect(() => checkedAssets([], worker, commit, {})).toThrow("CI-only");
  expect(() => checkSourceRun({}, [], "cloudflare-worker/v2026.10.0-pre", "owner/repo", "worker")).toThrow("CI-only");
});

test("Binary receipts bind both platforms and reject altered, misplaced and unlisted outputs", () => {
  const crawler = { product: "crawler", version: "0.0.0", channel: "release" };
  const files: Record<string, string | Buffer> = {};
  for (const platform of ["linux", "windows"]) {
    const name = platform === "linux" ? "vrcp-crawler-node-linux" : "vrcp-crawler-node.exe";
    const bytes = Buffer.from(`synthetic ${platform}`);
    files[name] = bytes;
    files[`crawler-${platform}.receipt.json`] = JSON.stringify({ ...crawler, commit, purpose: "ci-release",
      files: [{ name, size: bytes.length, sha256: digest(bytes) }] });
  }
  fixture(files, paths => expect(checkedAssets(paths, crawler, commit, {}, undefined).size).toBe(4));
  fixture({ ...files, "vrcp-crawler-node.exe": "changed" }, paths => expect(() => checkedAssets(paths, crawler, commit, {}, undefined)).toThrow("Binary bytes"));
  fixture({ ...files, "crawler-linux.receipt.json": files["crawler-windows.receipt.json"] },
    paths => expect(() => checkedAssets(paths, crawler, commit, {}, undefined)).toThrow("platform"));
  expect(allowedBinary("client.zip", "crawler-client", "0.0.0")).toBe(false);
  expect(allowedBinary("client_0.0.0_x64.msi", "crawler-client", "0.0.0")).toBe(true);
  expect(allowedBinary("client_0.0.0-setup.exe", "crawler-client", "0.0.0")).toBe(true);
  expect(allowedBinary("vrcp-web-0.0.0.tgz", "web", "0.0.0")).toBe(true);
  expect(allowedBinary("vrcp-web-0.0.1.tgz", "web", "0.0.0")).toBe(false);
});

test("streamed binary hashes retain receipt, platform, coverage and package boundaries", () => {
  const crawler = { product: "crawler", version: "0.0.1", channel: "release" };
  const files = new Map<string, Buffer>(), digests = new Map<string, { size: number; sha256: string }>();
  for (const platform of ["linux", "windows"]) {
    const name = platform === "linux" ? "vrcp-crawler-node-linux" : "vrcp-crawler-node.exe";
    const actual = { size: 300 * 1024 ** 2, sha256: digest(Buffer.from(platform)) };
    digests.set(name, actual);
    files.set(`crawler-${platform}.receipt.json`, Buffer.from(JSON.stringify({ ...crawler, commit, purpose: "ci-release",
      files: [{ name, ...actual }] })));
  }
  expect(checkedAssetBytes(files, crawler, commit, {}, digests)).toBe(files);
  const name = "vrcp-crawler-node-linux", original = digests.get(name)!;
  for (const invalid of [{ ...original, size: 1 }, { ...original, sha256: "b".repeat(64) },
    { ...original, size: 0 }, { ...original, size: NaN }, { ...original, sha256: "not-a-hash" }]) {
    digests.set(name, invalid);
    expect(() => checkedAssetBytes(files, crawler, commit, {}, digests)).toThrow();
  }
  digests.delete(name);
  expect(() => checkedAssetBytes(files, crawler, commit, {}, digests)).toThrow("Missing");
  digests.set(name, original);
  files.set(name, Buffer.from("duplicate"));
  expect(() => checkedAssetBytes(files, crawler, commit, {}, digests)).toThrow("Invalid streamed");
  files.delete(name);
  files.set("crawler-linux.receipt.json", files.get("crawler-windows.receipt.json")!);
  expect(() => checkedAssetBytes(files, crawler, commit, {}, digests)).toThrow("platform");
  expect(() => checkedAssetBytes(files, selected, commit, {}, digests)).toThrow("Invalid streamed");
  digests.set("extra.exe", original);
  expect(() => checkedAssetBytes(files, crawler, commit, {}, digests)).toThrow("Invalid streamed");
});

test("attachment summaries link exact releases, mark drafts and reject Worker or injected targets", () => {
  const tag = "vrcp-api/v2026.10.1-pre";
  expect(releaseSummary("SlamTheDragon/vrc-packages", tag, false))
    .toContain("[GitHub Release](https://github.com/SlamTheDragon/vrc-packages/releases/tag/vrcp-api%2Fv2026.10.1-pre)");
  expect(releaseSummary("SlamTheDragon/vrc-packages", tag, true)).toContain("publication pending");
  for (const invalid of ["cloudflare-worker/v0.0.1", `${tag}\nmalicious`, "vrcp-api/vlatest"])
    expect(() => releaseSummary("SlamTheDragon/vrc-packages", invalid, false)).toThrow();
  expect(() => releaseSummary("https://evil.invalid", tag, false)).toThrow("repository");
});

test("installer stamping normalizes names before receipts and rejects collisions without overwriting", async () => {
  // This tests filenames, not release authorization. Original release proof has separate ingress fixtures.
  const { config } = await readVersionConfig("preview");
  const version = config["preview-crawler-client"];
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_SHA: commit,
    GITHUB_REF: `refs/tags/vrcp-crawler-client/v${version}` };
  const stamp = (directory: string) => execFileSync(process.execPath,
    ["scripts/release-assets.mjs", "stamp", "preview", "crawler-client", directory], { env, stdio: "pipe", timeout: 15_000 });
  fixture({ "VRCP Crawler Client.msi": "synthetic MSI", "VRCP Crawler Client-setup.exe": "synthetic NSIS" }, paths => {
    const directory = dirname(paths[0]);
    stamp(directory);
    const receiptPath = join(directory, "crawler-client.receipt.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    expect(receipt.files.map((file: { name: string }) => file.name).sort())
      .toEqual(["VRCP.Crawler.Client-setup.exe", "VRCP.Crawler.Client.msi"]);
    expect(checkedAssets([receiptPath, ...receipt.files.map((file: { name: string }) => join(directory, file.name))],
      { product: "crawler-client", channel: "preview", version }, commit, {}).size).toBe(3);
  });
  fixture({ "VRCP Client.msi": "first", "VRCP.Client.msi": "second" }, paths => {
    expect(() => stamp(dirname(paths[0]))).toThrow("Duplicate output basenames");
    expect(paths.map(path => readFileSync(path, "utf8"))).toEqual(["first", "second"]);
  });
});

test("Release notes select one bounded product milestone, not every commit or another product", () => {
  const markdown = "# Milestones\n\n## package\n\n- SDK change.\n\n## worker\n\n- Worker-only change.\n";
  const notes = milestoneNotes(markdown, "package", selected, commit, "https://github.com/example/repo/actions/runs/1", "checked", "vrc-packages-api-preview");
  expect(notes).toStartWith("# vrc-packages-api-preview 2026.10.0-pre\n");
  expect(notes).toContain("SDK change");
  expect(notes).not.toContain("Worker-only");
  expect(notes).toContain(selected.version);
  expect(() => milestoneNotes(markdown, "crawler", selected, commit, "url", "checked", "vrcp-crawler-node")).toThrow("Missing");
  expect(() => milestoneNotes("## package\n" + "x".repeat(6001), "package", selected, commit, "url", "checked", "vrc-packages-api")).toThrow("bounded");
  expect(() => milestoneNotes(markdown, "package", selected, commit, "url", "checked", "Injected\nTitle")).toThrow("package.json name");
});

test("A release attachment source must be the same repository, tag, workflow and passed capability jobs", () => {
  const run = { event: "push", head_branch: "vrcp-api/v2026.10.0-pre", head_sha: commit,
    head_repository: { full_name: "owner/repo" }, path: ".github/workflows/vrc-packages-api.yml" };
  const jobs = ["build", "publish"].map(name => ({ name, status: "completed", conclusion: "success" }));
  expect(() => checkSourceRun(run, jobs, run.head_branch, "owner/repo", "package")).not.toThrow();
  const historical = { ...run, head_branch: "package/v2026.10.0-pre" };
  expect(() => checkSourceRun(historical, jobs, historical.head_branch, "owner/repo", "package")).not.toThrow();
  for (const altered of [{ ...run, event: "pull_request" }, { ...run, head_sha: "main" },
    { ...run, head_repository: { full_name: "attacker/fork" } }, { ...run, path: ".github/workflows/web.yml" }]) {
    expect(() => checkSourceRun(altered, jobs, run.head_branch, "owner/repo", "package")).toThrow("source");
  }
  expect(() => checkSourceRun(run, jobs.slice(1), run.head_branch, "owner/repo", "package")).toThrow("source");
  expect(() => checkSourceRun(run, [{ name: "build", status: "completed", conclusion: "failure" }], run.head_branch, "owner/repo", "package")).toThrow("source");
});

test("crawler releases require both platform checks and a passed or disabled container publication", () => {
  const run = { event: "push", head_branch: "vrcp-crawler/v0.0.0", head_sha: commit,
    head_repository: { full_name: "owner/repo" }, path: ".github/workflows/node-docker.yml" };
  const binaries = ["build-linux", "standalone-windows"].map(name => ({ name, status: "completed", conclusion: "success" }));
  for (const conclusion of ["success", "skipped"]) {
    expect(() => checkSourceRun(run, [...binaries, { name: "publish-container", status: "completed", conclusion }], run.head_branch, "owner/repo", "crawler")).not.toThrow();
  }
  for (const conclusion of ["failure", "cancelled", "timed_out"]) {
    expect(() => checkSourceRun(run, [...binaries, { name: "publish-container", status: "completed", conclusion }], run.head_branch, "owner/repo", "crawler")).toThrow("source");
  }
  expect(() => checkSourceRun(run, binaries, run.head_branch, "owner/repo", "crawler")).toThrow("source");
  const historical = { ...run, head_branch: "crawler/v0.0.0" };
  expect(() => checkSourceRun(historical, [{ name: "build-and-push", status: "completed", conclusion: "success" }, binaries[1]], historical.head_branch, "owner/repo", "crawler")).not.toThrow();
});

test("Release upload retries retain exact bytes, never clobber assets and publish only after every upload passes", async () => {
  const files = new Map([["CHANGELOG.md", Buffer.from("synthetic notes")], ["CHECKSUMS.sha256", Buffer.from("synthetic checksums")]]);
  let release: any = null;
  const assets: any[] = [];
  const actions: string[] = [];
  let loseACK = true;
  const api = async (method: string, path: string, body: any) => {
    actions.push(method);
    if (method === "GET") {
      if (path.includes("/tags/")) return release?.draft ? null : release;
      return path.includes("/assets?") ? assets : release ? [release] : [];
    }
    if (method === "POST") { release = { ...body, id: 1, assets: [] }; return release; }
    if (method === "UPLOAD") {
      const name = new URL("https://example.test" + path).searchParams.get("name");
      const asset = { name, digest: "sha256:" + digest(body), size: body.length, state: "uploaded" };
      assets.push(asset);
      if (loseACK) { loseACK = false; throw new Error("lost ACK"); }
      return asset;
    }
    // Reproduce the live API behavior: draft updates without tag_name detach the tag.
    Object.assign(release, body);
    if (body.draft && !body.tag_name) release.tag_name = "untagged-" + "a".repeat(20);
    return release;
  };
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false)).rejects.toThrow("lost ACK");
  expect(release.draft).toBe(true);
  expect(release.name).toBe("vrc-packages-api 0.0.0");
  expect(actions).not.toContain("PATCH");
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false);
  expect(release.draft).toBe(true);
  expect(release.tag_name).toBe("vrcp-api/v0.0.0");
  expect(assets).toHaveLength(2);
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "publication checked", files, false, false);
  expect(release.draft).toBe(false);
  const before = actions.length;
  await attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "publication checked", files, false, false);
  expect(actions.slice(before)).toEqual(["GET", "GET"]);
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "pending", files, true, false)).rejects.toThrow("regressed");
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "notes", new Map([["CHANGELOG.md", Buffer.from("changed")],
    ["CHECKSUMS.sha256", files.get("CHECKSUMS.sha256")!]]), false, false)).rejects.toThrow("not be overwritten");
  await expect(attachRelease(api, "owner/repo", "vrcp-api/v0.0.0", commit, "notes", files, false, true)).rejects.toThrow("channel");
});

test("Distributed products wire checked release assets, Worker stays CI-only and website stays disabled", () => {
  const prefixes: Record<string, string> = { "cloudflare-worker": "cloudflare-worker", "vrc-packages-api": "vrcp-api",
    network: "vrcp-network", "node-docker": "vrcp-crawler", "node-client": "vrcp-crawler-client" };
  for (const name of ["cloudflare-worker", "vrc-packages-api", "network", "node-docker", "node-client"]) {
    const workflow: any = Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
    const job = workflow.jobs["release-assets"];
    expect(workflow.on.push.tags).toEqual([`${prefixes[name]}/v*`]);
    if (name === "cloudflare-worker") { expect(job).toBeUndefined(); expect(workflow.permissions.contents).toBe("read"); continue; }
    expect(job.uses).toBe("./.github/workflows/release-assets.yml");
    expect(job.permissions.contents).toBe("write");
    expect(job.permissions.actions).toBe("read");
    expect(job.needs).toBeDefined();
  }
  expect(existsSync(new URL("../.github/workflows/web.yml", import.meta.url))).toBe(false);
  const reusable: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  expect(reusable.on.workflow_dispatch.inputs.tag.required).toBe(true);
  expect(reusable.jobs.attach.steps.find((step: any) => step.uses === "actions/checkout@v4").with.ref).toBe("${{ github.ref }}");
  expect(reusable.jobs.attach.steps.find((step: any) => step.uses?.startsWith("actions/download-artifact@")).with.path).toContain("runner.temp");
});

test("desktop review protects attachment itself, including manual retries, without an unguarded or duplicate path", () => {
  const reusable: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/release-assets.yml", import.meta.url), "utf8"));
  const unguarded = reusable.jobs.attach, guarded = reusable.jobs["attach-desktop"];
  const evaluate = (expression: string, inputTag: string, ref: string) =>
    new Function("inputs", "github", "startsWith", "contains", `return (${expression.slice(3, -3)});`)(
      { tag: inputTag }, { ref_name: ref }, (value: string, prefix: string) => value.startsWith(prefix),
      (value: string, part: string) => value.includes(part));
  expect(unguarded.environment).toBeUndefined();
  expect(guarded.steps).toEqual(unguarded.steps);
  const attachment = guarded.steps.find((step: any) => step.run?.includes("release-assets.mjs attach"));
  expect(attachment).toBeDefined();
  const receipt = guarded.steps.at(-1);
  expect(receipt.uses).toBe("actions/upload-artifact@v4");
  expect(receipt.with.name).toBe("ci-only-release-announcement");
  expect(receipt.with.path).toBe("${{ runner.temp }}/vrcp-release-announcement.json");
  expect(receipt.with["retention-days"]).toBe(14);
  expect(attachment.env.RELEASE_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
  for (const prefix of ["vrcp-crawler-client", "crawler-client"]) {
    for (const [version, environment] of [["0.0.3", "vrcp-crawler-client-release"], ["26.10.3-pre", "vrcp-crawler-client-preview"]]) {
      const tag = `${prefix}/v${version}`;
      for (const [input, ref] of [["", tag], [tag, "main"], [tag, "vrcp-api/v2026.10.3-pre"]]) {
        expect(evaluate(unguarded.if, input, ref)).toBe(false);
        expect(evaluate(guarded.if, input, ref)).toBe(true);
        expect(evaluate(guarded.environment.name, input, ref)).toBe(environment);
      }
    }
  }
  for (const tag of ["vrcp-api/v0.0.3", "vrcp-network/v2026.10.2", "vrcp-crawler/v2026.10.3-pre"]) {
    expect(evaluate(unguarded.if, "", tag)).toBe(true);
    expect(evaluate(guarded.if, "", tag)).toBe(false);
  }
  const caller: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/node-client.yml", import.meta.url), "utf8"));
  expect(caller.jobs["release-assets"].needs).toBe("build");
  expect(caller.jobs["release-assets"].uses).toBe("./.github/workflows/release-assets.yml");
  expect(caller.jobs["deployment-record"]).toBeUndefined();
});

test("release attachment rejects server-renamed assets before publishing the draft", async () => {
  let published = false;
  const files = new Map([["VRCP Client.msi", Buffer.from("synthetic MSI")]]);
  const release = { id: 1, tag_name: "vrcp-crawler-client/v0.0.0", draft: true, prerelease: false };
  const api = async (method: string, path: string, body: any) => {
    if (method === "GET") return path.includes("/tags/") ? release : [];
    if (method === "UPLOAD") return { name: "VRCP.Client.msi", size: body.length, digest: `sha256:${digest(body)}`, state: "uploaded" };
    if (method === "PATCH") published = true;
    throw new Error("Unexpected write");
  };
  await expect(attachRelease(api, "owner/repo", release.tag_name, commit, "notes", files, false, false))
    .rejects.toThrow("Uploaded");
  expect(published).toBe(false);
});

test("SDK promotion retains original notes and checksums when main or the note renderer changes", async () => {
  const oldNotes = Buffer.from(`# VRC Packages — package 0.0.0\n\nChannel: release.\nCommit: ${commit}.\n[Checked CI run](https://github.com/owner/repo/actions/runs/123)\n\nOriginal milestone.\n`);
  const tarball = Buffer.from("synthetic artifact");
  const files = new Map([["package.tgz", tarball], ["CHANGELOG.md", oldNotes]]);
  const checksum = Buffer.from([...files].map(([name, bytes]) => `${digest(bytes)}  ${name}`).join("\n") + "\n");
  files.set("CHECKSUMS.sha256", checksum);
  const assets = [...files].map(([name, bytes], id) => ({ id, name, size: bytes.length, digest: `sha256:${digest(bytes)}`, state: "uploaded" }));
  const release: any = { id: 1, draft: true, tag_name: "package/v0.0.0", prerelease: false,
    body: oldNotes.toString() + "\nCurrent delivery status: npm publication pending.\n" };
  let patches = 0;
  const api = async (method: string, path: string, body: any) => {
    if (method === "GET") {
      if (path.includes("/tags/")) return release.draft ? null : release;
      return path.includes("/assets?") ? assets : [release];
    }
    if (method === "DOWNLOAD") return files.get(assets.find(asset => path.endsWith(`/${asset.id}`))!.name);
    if (method === "UPLOAD") {
      expect(path).toContain("name=CHECKSUMS.sha256");
      const asset = { id: 2, name: "CHECKSUMS.sha256", size: body.length, digest: `sha256:${digest(body)}`, state: "uploaded" };
      assets.push(asset);
      return asset;
    }
    if (method !== "PATCH") throw new Error("Unexpected overwrite or upload");
    patches++;
    Object.assign(release, body);
    return release;
  };
  const candidate = new Map(files);
  candidate.set("CHANGELOG.md", Buffer.from("Main changed notes"));
  candidate.set("CHECKSUMS.sha256", Buffer.from("Main changed checksum rendering"));
  const newBody = `# VRC Packages - package 0.0.0\n[Checked CI run](https://github.com/owner/repo/actions/runs/123)\nCurrent delivery status: npm publication checked.\n`;
  await attachRelease(api, "owner/repo", release.tag_name, commit, newBody, candidate, false, false);
  expect(patches).toBe(1);
  expect(release.draft).toBe(false);
  expect(release.body).toContain("Original milestone");
  expect(release.body).toContain("npm publication checked");
  expect(candidate.get("CHANGELOG.md")).toEqual(oldNotes);
  expect(candidate.get("CHECKSUMS.sha256")).toEqual(checksum);
  await attachRelease(api, "owner/repo", release.tag_name, commit, newBody, candidate, false, false);
  expect(patches).toBe(1);
  await expect(attachRelease(api, "owner/repo", release.tag_name, "b".repeat(40), newBody, candidate, false, false)).rejects.toThrow("another delivery");
  const changed = new Map(candidate);
  changed.set("package.tgz", Buffer.from("altered"));
  await expect(attachRelease(api, "owner/repo", release.tag_name, commit, newBody, changed, false, false)).rejects.toThrow("checksum index");
  assets.splice(assets.findIndex(asset => asset.name === "CHECKSUMS.sha256"), 1);
  await expect(attachRelease(api, "owner/repo", release.tag_name, commit, newBody, new Map(files), false, false)).rejects.toThrow("missing");
  release.draft = true;
  await attachRelease(api, "owner/repo", release.tag_name, commit, newBody, new Map(files), false, false);
  expect(release.draft).toBe(false);
  expect(patches).toBe(2);
  release.draft = true;
  release.tag_name = "untagged-" + "a".repeat(20);
  release.name = "VRC Packages - package/v0.0.0";
  release.body = oldNotes.toString() + "\nCurrent delivery status: npm publication pending.\n";
  await expect(attachRelease(api, "owner/repo", "package/v0.0.0", "b".repeat(40), newBody, new Map(files), false, false))
    .rejects.toThrow("another delivery");
  expect(patches).toBe(2);
  const orphanBody = release.body;
  release.body = orphanBody.replace("owner/repo", "attacker/fork");
  await expect(attachRelease(api, "owner/repo", "package/v0.0.0", commit, newBody, new Map(files), false, false))
    .rejects.toThrow("checked repository");
  release.body = orphanBody;
  const checksumAsset = assets.splice(assets.findIndex(asset => asset.name === "CHECKSUMS.sha256"), 1)[0];
  await expect(attachRelease(api, "owner/repo", "package/v0.0.0", commit, newBody, new Map(files), false, false))
    .rejects.toThrow("lacks checked");
  assets.push(checksumAsset);
  const noteAsset = assets.find(asset => asset.name === "CHANGELOG.md")!;
  const noteDigest = noteAsset.digest;
  noteAsset.digest = "sha256:" + "0".repeat(64);
  await expect(attachRelease(api, "owner/repo", "package/v0.0.0", commit, newBody, new Map(files), false, false))
    .rejects.toThrow("digest");
  noteAsset.digest = noteDigest;
  expect(patches).toBe(2);
  await attachRelease(api, "owner/repo", "package/v0.0.0", commit, newBody, new Map(files), false, false);
  expect(release.tag_name).toBe("package/v0.0.0");
  expect(release.draft).toBe(false);
  expect(patches).toBe(3);
  expect(files.get("CHANGELOG.md")).toEqual(oldNotes);
});

test("SDK draft reconciliation dispatches only public versions with original checked run links", async () => {
  const draft = { draft: true, tag_name: "vrcp-api/v0.0.0", body: "[Checked CI run](https://github.com/owner/repo/actions/runs/123)" };
  const releases = [draft, { ...draft, tag_name: "package/v2026.10.0-pre" },
    { ...draft, tag_name: "vrcp-api/v0.0.1" }, { ...draft, draft: false },
    { ...draft, tag_name: "cloudflare-worker/v0.0.0" }, { ...draft, tag_name: "vrcp-network/v0.0.0" },
    { ...draft, body: "[Checked CI run](https://github.com/attacker/fork/actions/runs/123)" },
    { ...draft, body: "[Checked CI run](https://github.com/owner/repo/actions/runs/123?modified=true)" },
    { ...draft, tag_name: "vrcp-api/v01.0.0" }, { ...draft, body: "No checked source run" },
    { ...draft, tag_name: "untagged-" + "a".repeat(20), name: "VRC Packages - vrcp-api/v0.0.0" }];
  const dispatched: any[] = [];
  const registry: string[] = [];
  const reports: any[] = [];
  const api = async (method: string, path: string, body: any) => {
    if (method === "GET") return releases;
    expect(path).toBe("/repos/owner/repo/actions/workflows/release-assets.yml/dispatches");
    dispatched.push(body);
    return null;
  };
  expect(await reconcileSDKDrafts(api, "owner/repo", async (name: string, version: string) => {
    registry.push(`${name}@${version}`);
    return version !== "0.0.1";
  }, (counts: any) => reports.push(counts))).toBe(3);
  expect(reports).toEqual([{ releases: 11, drafts: 10, sdkDrafts: 7, checkedDrafts: 4, unpublished: 1, dispatched: 3 }]);
  expect(registry).toEqual(["vrc-packages-api@0.0.0", "vrc-packages-api-preview@2026.10.0-pre", "vrc-packages-api@0.0.1", "vrc-packages-api@0.0.0"]);
  expect(dispatched.map(item => item.inputs.tag)).toEqual(["vrcp-api/v0.0.0", "package/v2026.10.0-pre", "vrcp-api/v0.0.0"]);
  expect(dispatched.every(item => item.ref === "main" && item.inputs["source-run"] === "123")).toBe(true);
  const renamedDraft = { ...draft, body: draft.body.replace("owner/repo", "SlamTheDragon/vrc-package-crawler") };
  const renamedDispatches: any[] = [];
  expect(await reconcileSDKDrafts(async (method: string, _path: string, body: any) => {
    if (method === "GET") return [renamedDraft];
    renamedDispatches.push(body); return {};
  }, "SlamTheDragon/vrc-packages", async () => true)).toBe(1);
  expect(renamedDispatches[0].inputs["source-run"]).toBe("123");
  await expect(reconcileSDKDrafts(api, "owner/repo", async () => { throw new Error("registry unavailable"); })).rejects.toThrow("unavailable");
  await expect(reconcileSDKDrafts(async () => Array(100).fill({ draft: false }), "owner/repo", async () => true)).rejects.toThrow("bound");
  await expect(reconcileSDKDrafts(async (method: string) => method === "GET" ? Array(21).fill(draft) : null,
    "owner/repo", async () => true)).rejects.toThrow("dispatch limit");
  await expect(reconcileSDKDrafts(async () => ({}), "owner/repo", async () => true)).rejects.toThrow("listing");
  const workflow: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/sdk-release-reconcile.yml", import.meta.url), "utf8"));
  expect(workflow.on.schedule).toHaveLength(1);
  // Read-only tokens can list public releases but cannot discover pending drafts.
  expect(workflow.permissions).toEqual({ contents: "write", actions: "write" });
  expect(workflow.jobs["check-drafts"].steps[0].with["persist-credentials"]).toBe(false);
  expect(workflow.jobs["check-drafts"].steps.at(-1).env).toEqual({ RELEASE_TOKEN: "${{ secrets.GITHUB_TOKEN }}" });
});
