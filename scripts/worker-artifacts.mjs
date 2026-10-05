import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { validateCIArtifact } from "./delivery.mjs";

const archiveLimit = 16 * 1024 ** 2;
const fileLimits = { "worker_entry.js": archiveLimit, "worker_entry.js.json": 2 * 1024 ** 2 };

/** Keep GitHub credentials on the API request, never on the signed storage request. */
export async function downloadActionsArchive(repository, id, token, request = fetch) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !Number.isSafeInteger(id) || id < 1) {
    throw new Error("Invalid Actions artifact identity");
  }
  let reader;
  try {
    const signal = AbortSignal.timeout(180_000);
    const redirect = await request(`https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`, {
      redirect: "manual", signal, headers: { accept: "application/vnd.github+json", "user-agent": "VRCPDelivery",
        ...(token ? { authorization: `Bearer ${token}` } : {}) }
    });
    await redirect.body?.cancel();
    const url = new URL(redirect.headers.get("location") ?? "");
    if (redirect.status !== 302 || url.protocol !== "https:" || url.username || url.password || url.port ||
        ![".blob.core.windows.net", ".githubusercontent.com"].some(suffix => url.hostname.endsWith(suffix))) {
      throw new Error("Untrusted artifact redirect");
    }
    const response = await request(url, { redirect: "error", signal });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error("Artifact unavailable");
    }
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > archiveLimit) throw new Error("Artifact exceeds download budget");
      chunks.push(value);
    }
    if (!size) throw new Error("Empty artifact");
    return Buffer.concat(chunks);
  } catch {
    // Native network errors can contain the private signed storage URL.
    throw new Error("Actions artifact download failed or exceeded its trusted transport budget");
  } finally {
    try { await reader?.cancel(); } catch { /* Do not expose transport details. */ }
  }
}

/** Check directory sizes before decompression, then bind the bytes to the source receipt. */
export function checkWorkerArchive(bytes, artifact, expected) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > archiveLimit ||
      artifact.digest !== `sha256:${createHash("sha256").update(bytes).digest("hex")}`) {
    throw new Error("Worker archive digest or download size differs");
  }
  const declared = new Map();
  let files;
  try {
    files = unzipSync(bytes, { filter(file) {
      if (!Object.hasOwn(fileLimits, file.name) || declared.has(file.name) ||
          !Number.isSafeInteger(file.originalSize) || file.originalSize < 1 || file.originalSize > fileLimits[file.name] ||
          !Number.isSafeInteger(file.size) || file.size < 1 || file.size > archiveLimit ||
          ![0, 8].includes(file.compression) || file.compression === 0 && file.size !== file.originalSize) {
        throw new Error("Invalid directory entry");
      }
      declared.set(file.name, file.originalSize);
      return true;
    } });
    if (declared.size !== 2 || Object.keys(files).length !== 2 ||
        [...declared].some(([name, size]) => files[name]?.byteLength !== size)) {
      throw new Error("Incomplete directory");
    }
  } catch { throw new Error("Worker archive has invalid files, sizes or ZIP structure"); }
  let receipt;
  try { receipt = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files["worker_entry.js.json"])); }
  catch { throw new Error("Worker archive receipt is invalid"); }
  validateCIArtifact(receipt, expected, files["worker_entry.js"]);
  return { artifact: artifact.id, archiveSha256: artifact.digest.slice(7),
    bundleSha256: receipt.sha256, bundleBytes: files["worker_entry.js"].byteLength };
}

export async function checkWorkerArtifacts(api, base, run, expected) {
  const listing = await api(`${base}/actions/runs/${run.id}/artifacts?per_page=100`);
  if (!Array.isArray(listing.artifacts) || !Number.isSafeInteger(listing.total_count) ||
      listing.total_count !== listing.artifacts.length || listing.total_count >= 100) {
    throw new Error("Worker artifact lookup is incomplete or exceeds its bound");
  }
  const matching = listing.artifacts.filter(artifact => artifact.name === `worker-${expected.channel}-bundle`);
  if (matching.length !== 1) throw new Error("Worker bundle artifact is missing or ambiguous");
  const artifact = matching[0];
  if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || artifact.expired !== false ||
      !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > archiveLimit ||
      artifact.workflow_run?.head_sha !== expected.commit || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? "")) {
    throw new Error("Worker artifact metadata is expired, oversized or differs from its source");
  }
  return checkWorkerArchive(await api(`${base}/actions/artifacts/${artifact.id}/zip`, false, "archive"), artifact, expected);
}
