import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { checkWorkerArchive, checkWorkerArtifacts, downloadActionsArchive } from "../scripts/worker-artifacts.mjs";

const expected = { product: "worker", name: "synthetic-worker", version: "2026.10.3-pre", channel: "preview",
  commit: "a".repeat(40), configSha256: "b".repeat(64) };
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bundle = Buffer.from("Synthetic bundle fixture, not a release artifact");
const receipt = { ...expected, purpose: "ci-release", sha256: hash(bundle) };
const files = (overrides = {}) => ({ "worker_entry.js": bundle,
  "worker_entry.js.json": Buffer.from(JSON.stringify(receipt)), ...overrides });
const archive = (overrides = {}) => zipSync(files(overrides));
const metadata = (bytes: Uint8Array) => ({ id: 7, name: "worker-preview-bundle", expired: false,
  size_in_bytes: bytes.length, digest: `sha256:${hash(bytes)}`, workflow_run: { head_sha: expected.commit } });

test("Worker archive binds exact bundle, receipt and directory limits before expansion", () => {
  const bytes = archive();
  expect(checkWorkerArchive(bytes, metadata(bytes), expected)).toEqual({ artifact: 7, archiveSha256: hash(bytes),
    bundleSha256: hash(bundle), bundleBytes: bundle.length });
  expect(() => checkWorkerArchive(bytes, { ...metadata(bytes), digest: "sha256:" + "c".repeat(64) }, expected)).toThrow("digest");
  for (const [key, value] of Object.entries({ product: "crawler", name: "wrong", version: "0.0.0", channel: "release",
    commit: "c".repeat(40), configSha256: "d".repeat(64), purpose: "development", sha256: "e".repeat(64) })) {
    const altered = archive({ "worker_entry.js.json": Buffer.from(JSON.stringify({ ...receipt, [key]: value })) });
    expect(() => checkWorkerArchive(altered, metadata(altered), expected)).toThrow("CI artifact differs");
  }
  for (const entries of [files({ "../escape": Buffer.from("x") }), { "worker_entry.js": bundle },
    files({ "worker_entry.js": Buffer.alloc(0) }), files({ "worker_entry.js.json": Buffer.from("not JSON") }),
    files({ "worker_entry.js": Buffer.from("altered") })]) {
    const altered = zipSync(entries);
    expect(() => checkWorkerArchive(altered, metadata(altered), expected)).toThrow();
  }
  const malformed = Buffer.from("not ZIP");
  expect(() => checkWorkerArchive(malformed, metadata(malformed), expected)).toThrow("ZIP structure");
  // Change central-directory uncompressed size before the library allocates its output.
  const bomb = Buffer.from(bytes), central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  expect(central).toBeGreaterThan(0);
  bomb.writeUInt32LE(0xffffffff, central + 24);
  expect(() => checkWorkerArchive(bomb, metadata(bomb), expected)).toThrow("ZIP structure");
  // Equal-length names allow a duplicate central-directory entry without new fixture writers.
  const duplicate = Buffer.from(zipSync({ "worker_entry.js": bundle, "worker_entry.jx": bundle }));
  const position = duplicate.lastIndexOf(Buffer.from("worker_entry.jx"));
  duplicate.write("worker_entry.js", position);
  expect(() => checkWorkerArchive(duplicate, metadata(duplicate), expected)).toThrow("ZIP structure");
});

test("Worker artifact listing rejects ambiguous, expired, incomplete and wrong-source metadata", async () => {
  const bytes = archive();
  let listing = { total_count: 1, artifacts: [metadata(bytes)] };
  let downloads = 0;
  const api = async (path: string, _missing = false, format = "json") => {
    if (format === "archive") { expect(path).toBe("/repos/example/fixture/actions/artifacts/7/zip"); downloads++; return bytes; }
    return listing;
  };
  expect((await checkWorkerArtifacts(api, "/repos/example/fixture", { id: 123 }, expected)).artifact).toBe(7);
  for (const altered of [{ expired: true }, { id: -1 }, { size_in_bytes: 17 * 1024 ** 2 },
    { digest: null }, { workflow_run: { head_sha: "c".repeat(40) } }, { name: "worker-release-bundle" }]) {
    listing = { total_count: 1, artifacts: [{ ...metadata(bytes), ...altered } as any] };
    await expect(checkWorkerArtifacts(api, "/repos/example/fixture", { id: 123 }, expected)).rejects.toThrow();
  }
  listing = { total_count: 2, artifacts: [metadata(bytes), metadata(bytes)] };
  await expect(checkWorkerArtifacts(api, "/repos/example/fixture", { id: 123 }, expected)).rejects.toThrow("ambiguous");
  listing = { total_count: 2, artifacts: [metadata(bytes)] };
  await expect(checkWorkerArtifacts(api, "/repos/example/fixture", { id: 123 }, expected)).rejects.toThrow("incomplete");
  expect(downloads).toBe(1);
});

test("Actions archive transport keeps credentials on GitHub and redacts signed download failures", async () => {
  const calls: Array<{ input: string; options: any }> = [];
  let target = "https://fixture.blob.core.windows.net/archive?private-signature=synthetic";
  let body: Uint8Array | null = archive();
  let fail = false;
  const request = async (input: any, options: any) => {
    calls.push({ input: String(input), options });
    if (String(input).startsWith("https://api.github.com/")) return new Response(null, { status: 302, headers: { location: target } });
    if (fail) throw new Error(target);
    return new Response(body);
  };
  expect(await downloadActionsArchive("example/fixture", 7, "synthetic-token", request)).toEqual(Buffer.from(body!));
  expect(calls[0].options.headers.authorization).toBe("Bearer synthetic-token");
  expect(calls[0].options.redirect).toBe("manual");
  expect(calls[1].options.headers).toBeUndefined();
  expect(calls[1].options.redirect).toBe("error");
  for (const url of ["http://fixture.blob.core.windows.net/x", "https://evil.invalid/x", "https://user:pass@fixture.blob.core.windows.net/x",
    "https://blob.core.windows.net.evil.invalid/x"]) {
    target = url; const count = calls.length;
    await expect(downloadActionsArchive("example/fixture", 7, "synthetic-token", request)).rejects.toThrow("trusted transport budget");
    expect(calls.length).toBe(count + 1);
  }
  target = "https://fixture.blob.core.windows.net/archive?private-signature=synthetic";
  fail = true;
  await expect(downloadActionsArchive("example/fixture", 7, undefined, request)).rejects.toThrow("trusted transport budget");
  fail = false; body = new Uint8Array(16 * 1024 ** 2 + 1);
  await expect(downloadActionsArchive("example/fixture", 7, undefined, request)).rejects.toThrow("trusted transport budget");
  body = null;
  await expect(downloadActionsArchive("example/fixture", 7, undefined, request)).rejects.toThrow("trusted transport budget");
  await expect(downloadActionsArchive("example/fixture", -1, undefined, request)).rejects.toThrow("identity");
});
