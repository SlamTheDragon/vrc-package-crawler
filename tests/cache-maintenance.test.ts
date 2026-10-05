import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { maintainCaches } from "../scripts/cache-maintenance.mjs";

const now = new Date("2026-10-05T12:00:00Z"), base = "/repos/SlamTheDragon/vrc-packages";
function cache(id: number, changes = {}) {
  return { id, key: `bun-${id}`, ref: `refs/tags/vrcp-api/v2026.10.${id}-pre`, size_in_bytes: 3_000_000_000,
    last_accessed_at: "2026-10-01T00:00:00Z", ...changes };
}
function fixture(rows: any[], options: any = {}) {
  const deleted: number[] = [], calls: { method: string; path: string }[] = [];
  const api = async (method: string, path: string) => {
    calls.push({ method, path });
    if (path === `${base}/actions/cache/storage-limit`) return { max_cache_size_gb: options.cap ?? 10 };
    if (method === "DELETE") { deleted.push(Number(path.split("/").at(-1))); return; }
    const url = new URL(path, "https://api.github.com");
    if (url.pathname === `${base}/actions/caches`) {
      const query = url.searchParams;
      const matches = rows.filter(row => !query.has("key") || row.key === query.get("key") && row.ref === query.get("ref"));
      const result = matches.map(row => query.has("key") && options.recent ? { ...row, last_accessed_at: now.toISOString() } : row);
      return { total_count: options.incomplete ? 101 : result.length, actions_caches: result };
    }
    if (url.pathname === `${base}/actions/runs`) return { total_count: options.activeOverflow ? 100 : options.active ? 1 : 0,
      workflow_runs: options.active ? [{ head_branch: options.active }] : [] };
    throw new Error("Unexpected API path");
  };
  return { api, deleted, calls };
}

test("cache maintenance measures the cap and is read-only below threshold or during planning", async () => {
  const small = fixture([cache(1)]);
  expect((await maintainCaches(small.api, { execute: true, now })).status).toBe("below-threshold");
  expect(small.deleted).toEqual([]);
  const full = fixture([cache(1), cache(2), cache(3)]);
  const plan = await maintainCaches(full.api, { now });
  expect(plan.status).toBe("planned"); expect(plan.selected).toEqual([1]); expect(plan.estimatedBytes).toBe(6_000_000_000);
  expect(full.deleted).toEqual([]);
  const capped = fixture([cache(1)], { cap: 150 });
  expect((await maintainCaches(capped.api, { now })).limitBytes).toBe(10_000_000_000);
});

test("cache pruning targets exact old tag-cache IDs and protects active refs, branches and recent access", async () => {
  const f = fixture([cache(1), cache(2), cache(3, { ref: "refs/heads/main" })], { active: "vrcp-api/v2026.10.1-pre" });
  const result = await maintainCaches(f.api, { execute: true, now });
  expect(result.status).toBe("pruned"); expect(f.deleted).toEqual([2]);
  expect(f.calls.filter(call => call.method === "DELETE")).toEqual([{ method: "DELETE", path: `${base}/actions/caches/2` }]);
  const protectedRows = fixture([cache(1, { ref: "refs/pull/4/merge" }), cache(2, { ref: "refs/heads/main" }),
    cache(3, { last_accessed_at: now.toISOString() })]);
  expect((await maintainCaches(protectedRows.api, { execute: true, now })).status).toBe("protected-caches-remain");
  expect(protectedRows.deleted).toEqual([]);
  const changed = fixture([cache(1), cache(2), cache(3)], { recent: true });
  expect((await maintainCaches(changed.api, { execute: true, now })).status).toBe("protected-caches-remain");
  expect(changed.deleted).toEqual([]);
});

test("cache metadata, pagination, permissions and active-run uncertainty fail before deletion", async () => {
  for (const f of [fixture([cache(1)], { cap: 0 }), fixture([cache(1)], { incomplete: true }),
    fixture([cache(1, { last_accessed_at: "unknown" })]), fixture([cache(1), cache(2), cache(3)], { activeOverflow: true }),
    fixture([cache(1), cache(1)])]) {
    await expect(maintainCaches(f.api, { execute: true, now })).rejects.toThrow();
    expect(f.deleted).toEqual([]);
  }
  await expect(maintainCaches(async () => { throw new Error("permission denied"); }, { execute: true, now })).rejects.toThrow("permission denied");
});

test("cache CI uses scoped actions write, trusted main and only canonical completed push workflows", () => {
  const workflow: any = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/cache-maintenance.yml", import.meta.url), "utf8"));
  expect(workflow.permissions).toEqual({ contents: "read", actions: "write" });
  expect(workflow.on.workflow_run.types).toEqual(["completed"]);
  expect(workflow.on.workflow_run.workflows).toHaveLength(5);
  expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  const job = workflow.jobs.maintain;
  expect(job.if).toContain("head_repository.full_name == github.repository");
  expect(job.if).toContain("workflow_run.event == 'push'");
  expect(job.steps[0].with).toEqual({ ref: "main", "persist-credentials": false });
  expect(job.steps.some((step: any) => step.uses?.includes("download-artifact"))).toBe(false);
  expect(job.steps.at(-1).run).toBe("bun run cache:prune");
  expect(job.steps.at(-1).env.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
});

test("cache CLI exposes only the rejected operation and numeric status, never response bodies", () => {
  const path = fileURLToPath(new URL("../scripts/cache-maintenance.mjs", import.meta.url));
  const script = `process.argv[1] = ${JSON.stringify(path)};
    globalThis.fetch = async () => Response.json({ message: 'PRIVATE_RESPONSE_SENTINEL' }, { status: 403 });
    await import(${JSON.stringify(new URL("../scripts/cache-maintenance.mjs", import.meta.url).href)});`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, GH_TOKEN: "not-a-credential", GITHUB_TOKEN: "", GITHUB_REPOSITORY: "SlamTheDragon/vrc-packages" },
    encoding: "utf8", timeout: 10_000
  });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain("Cache API status: 403, operation: cap");
  expect(run.stderr).not.toContain("PRIVATE_RESPONSE_SENTINEL");
  expect(run.stderr).not.toContain("not-a-credential");
});
