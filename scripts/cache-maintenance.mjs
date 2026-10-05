import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productTagPrefixes } from "./versioning.mjs";

const repository = "SlamTheDragon/vrc-packages";
const base = `/repos/${repository}`;
const activeStatuses = ["queued", "in_progress", "waiting", "pending", "requested"];
const tagPrefixes = Object.values(productTagPrefixes).map(prefix => `refs/tags/${prefix}/v`);

async function listCaches(api, query = "") {
  const rows = [], ids = new Set();
  for (let page = 1; page <= 20; page++) {
    const result = await api("GET", `${base}/actions/caches?per_page=100&page=${page}${query}`);
    if (!Number.isSafeInteger(result.total_count) || result.total_count < 0 || !Array.isArray(result.actions_caches)) throw new Error("Cache listing is malformed");
    for (const cache of result.actions_caches) {
      if (!Number.isSafeInteger(cache.id) || cache.id < 1 || ids.has(cache.id) ||
          !Number.isSafeInteger(cache.size_in_bytes) || cache.size_in_bytes < 0 ||
          typeof cache.key !== "string" || !cache.key || cache.key.length > 512 ||
          typeof cache.ref !== "string" || !cache.ref.startsWith("refs/") ||
          !Number.isFinite(Date.parse(cache.last_accessed_at))) throw new Error("Cache identity or access time is malformed");
      ids.add(cache.id); rows.push(cache);
    }
    if (rows.length === result.total_count) return rows;
    if (!result.actions_caches.length || rows.length > result.total_count) break;
  }
  throw new Error("Cache listing is incomplete or changed during pagination; no further deletion ran");
}

async function activeRefs(api) {
  const refs = new Set();
  for (const status of activeStatuses) {
    const result = await api("GET", `${base}/actions/runs?status=${status}&per_page=100`);
    if (!Number.isSafeInteger(result.total_count) || result.total_count >= 100 || !Array.isArray(result.workflow_runs) ||
        result.total_count !== result.workflow_runs.length) throw new Error("Active run listing is incomplete");
    for (const run of result.workflow_runs) {
      if (typeof run.head_branch !== "string" || !run.head_branch || run.head_branch.length > 512) throw new Error("Active run ref is unknown");
      refs.add(`refs/tags/${run.head_branch}`);
    }
  }
  return refs;
}

/** Only old product-tag caches are eligible. Branch caches and delivery artifacts are not targets. */
export async function maintainCaches(api, { execute = false, now = new Date() } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Cache maintenance needs a valid time");
  const cap = await api("GET", `${base}/actions/cache/storage-limit`);
  if (!Number.isSafeInteger(cap.max_cache_size_gb) || cap.max_cache_size_gb < 1) throw new Error("Cache cap is unknown");
  // Keep a conservative ceiling even if an administrator later enables paid cache capacity.
  const limitBytes = Math.min(cap.max_cache_size_gb, 10) * 1_000_000_000;
  const caches = await listCaches(api);
  const bytes = caches.reduce((sum, row) => sum + row.size_in_bytes, 0);
  if (!Number.isSafeInteger(bytes)) throw new Error("Cache byte total exceeds the supported range");
  const result = { repository, purpose: execute ? "cache-maintenance" : "plan-only", bytes, limitBytes,
    thresholdBytes: Math.floor(limitBytes * 0.8), targetBytes: Math.floor(limitBytes * 0.6), selected: [], deleted: [], estimatedBytes: bytes };
  if (bytes < result.thresholdBytes) return { ...result, status: "below-threshold" };
  const refs = await activeRefs(api);
  const eligible = cache => tagPrefixes.some(prefix => cache.ref.startsWith(prefix)) &&
    !refs.has(cache.ref) && now.getTime() - Date.parse(cache.last_accessed_at) >= 86_400_000;
  const candidates = caches.filter(eligible).sort((a, b) => Date.parse(a.last_accessed_at) - Date.parse(b.last_accessed_at) || a.id - b.id);
  for (const candidate of candidates) {
    if (result.estimatedBytes <= result.targetBytes || result.selected.length >= 25) break;
    if (execute) {
      // Recheck the exact cache ID and active refs just before each bounded deletion.
      const current = (await listCaches(api, `&key=${encodeURIComponent(candidate.key)}&ref=${encodeURIComponent(candidate.ref)}`)).find(row => row.id === candidate.id);
      const currentRefs = await activeRefs(api);
      if (!current || current.key !== candidate.key || current.ref !== candidate.ref || current.size_in_bytes !== candidate.size_in_bytes ||
          current.last_accessed_at !== candidate.last_accessed_at || currentRefs.has(current.ref) || !eligible(current)) continue;
      await api("DELETE", `${base}/actions/caches/${current.id}`);
      result.deleted.push(current.id);
    }
    result.selected.push(candidate.id);
    result.estimatedBytes -= candidate.size_in_bytes;
  }
  return { ...result, status: result.estimatedBytes <= result.targetBytes ? execute ? "pruned" : "planned" : "protected-caches-remain" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.length === 1 && args[0] !== "--execute") throw new Error("Use cache maintenance with optional --execute only");
    if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== repository) throw new Error("Cache maintenance is restricted to the canonical repository");
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) throw new Error("Cache maintenance requires a scoped GitHub token; never put it in a command argument");
    const api = async (method, path) => {
      const response = await fetch(`https://api.github.com${path}`, { method, redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10" } });
      if (method === "DELETE" && response.status === 204) return;
      if (!response.ok || method === "DELETE") {
        const operation = path.endsWith("/storage-limit") ? "cap" : path.includes("/actions/runs?") ? "active-runs" : method === "DELETE" ? "delete" : "list";
        throw new Error(`Cache API failed (${response.status}); operation=${operation}; no further deletion ran`);
      }
      return response.json();
    };
    console.log(JSON.stringify(await maintainCaches(api, { execute: args[0] === "--execute" }), null, 2));
  } catch (error) {
    // Show only our numeric HTTP status, never a fetch URL, token, or response body.
    const status = error instanceof Error && /^Cache API failed \((\d{3})\); operation=(cap|active-runs|delete|list);/.exec(error.message);
    if (status) console.error(`Cache API status: ${status[1]}, operation: ${status[2]}`);
    console.error("Cache maintenance failed closed. Inspect API permissions and bounded listing checks. No artifacts or registry versions were targets.");
    process.exitCode = 1;
  }
}
