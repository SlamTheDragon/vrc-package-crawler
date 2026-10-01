import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unusedLoopbackPort } from "./loopback_port.ts";
import { loadScopedGitHubTokenFromEnvFile } from "../src/node/adapters/observation_adapter.ts";

// One public REST repository metadata request; no search, README, or archive download.
if (process.env.LIVE_GITHUB_SMOKE !== "1") {
  throw new Error("Set LIVE_GITHUB_SMOKE=1 to run the public GitHub repository metadata smoke test");
}
const reviewReference = process.env.LIVE_SOURCE_REVIEW_REFERENCE;
const retainClasses = process.env.LIVE_SOURCE_RETAIN_CLASSES?.split(",").filter(Boolean);
if (!reviewReference || !retainClasses?.length) {
  throw new Error("Set LIVE_SOURCE_REVIEW_REFERENCE and LIVE_SOURCE_RETAIN_CLASSES for this reviewed live scope");
}

const sourceUrl = "https://api.github.com/repos/vrc-get/vrc-get";
const smokeDir = mkdtempSync(join(tmpdir(), "vrc-live-github-"));
const resolvedSmokeDir = realpathSync(smokeDir);
if (!resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) throw new Error("Smoke directory escaped system temp");
const dbPath = join(resolvedSmokeDir, "coordinator.db");
const coordinatorBinary = resolve(existsSync("dist/local-coordinator/vrc-coordinator.exe") ?
  "dist/local-coordinator/vrc-coordinator.exe" : "dist/vrc-coordinator.exe");
const nodeBinary = resolve(existsSync("dist/local-node/vrc-node.exe") ?
  "dist/local-node/vrc-node.exe" : "dist/vrc-node.exe");
const env: Record<string, string | undefined> = { ...process.env, COORDINATOR_DB_PATH: dbPath };
if (!env.GITHUB_TOKEN && !env.GH_TOKEN) {
  const fallbackToken = loadScopedGitHubTokenFromEnvFile(process.cwd());
  if (fallbackToken) {
    env.GITHUB_TOKEN = fallbackToken;
  }
}
let server: ReturnType<typeof Bun.spawn> | undefined;

function command(binary: string, args: string[]): string {
  const result = Bun.spawnSync([binary, ...args], { env });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout);
}

try {
  const token = (JSON.parse(command(coordinatorBinary, ["register", "live-github-node", "github"])) as { token: string }).token;
  const target = new URL(sourceUrl);
  command(coordinatorBinary, ["profile-create", JSON.stringify({ schemaVersion: 1, platform: "github",
    origin: target.origin, pathScope: target.pathname, method: "GET", purpose: "metadata",
    minDelayMs: 60_000, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    reviewReference, reason: "Explicit bounded live GitHub metadata smoke",
    retainClasses, publishClasses: [] })]);
  command(coordinatorBinary, ["seed", "github", sourceUrl]);
  const robots = JSON.parse(command(coordinatorBinary, ["refresh-queued-robots", "1"])) as {
    refreshed: Array<{ origin: string; usable: boolean; statusCode: number; error?: string }>
  };
  if (robots.refreshed.length !== 1 || robots.refreshed[0].origin !== new URL(sourceUrl).origin ||
      !robots.refreshed[0].usable) throw new Error(`GitHub API robots status is not usable: ${JSON.stringify(robots)}`);
  const port = await unusedLoopbackPort();
  server = Bun.spawn([coordinatorBinary, "serve", String(port)], { env, stdout: "pipe", stderr: "pipe" });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/node/jobs/claim`);
      if (response.status === 404) { ready = true; break; }
    } catch { /* Wait for process startup. */ }
    await Bun.sleep(100);
  }
  if (!ready) throw new Error("Compiled coordinator did not start");
  const paceDb = new Database(dbPath, { readonly: true });
  try {
    const row = paceDb.prepare("SELECT next_allowed_at FROM origin_leases WHERE origin=?")
      .get(target.origin) as { next_allowed_at: string } | null;
    if (!row) throw new Error("GitHub origin pacing row missing after robots preflight");
    await Bun.sleep(Math.max(0, Date.parse(row.next_allowed_at) - Date.now()) + 100);
  } finally { paceDb.close(true); }
  const { COORDINATOR_DB_PATH: _coordinatorDbPath,
    COORDINATOR_OPERATOR_TOKEN: _coordinatorOperatorToken, ...nodeBaseEnv } = env;
  const node = Bun.spawnSync([nodeBinary, "--once"], { env: {
    ...nodeBaseEnv, NODE_ID: "live-github-node", NODE_TOKEN: token, NODE_CAPABILITIES: "github",
    COORDINATOR_URL: `http://127.0.0.1:${port}`
  } });
  const output = new TextDecoder().decode(node.stdout);
  if (node.exitCode !== 0 || !output.includes('"outcome":"changed"')) {
    throw new Error(`Compiled GitHub node did not produce metadata evidence: ${output} ${new TextDecoder().decode(node.stderr)}`);
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare(`SELECT i.source_url, v.payload_json, v.source_profile_id
      FROM source_items i JOIN source_versions v ON v.source_key=i.source_key
      ORDER BY v.version_no DESC LIMIT 1`).get() as {
        source_url: string; payload_json: string; source_profile_id: string | null
      } | null;
    if (!row || row.source_url !== sourceUrl) throw new Error("GitHub metadata was not persisted at the expected source URL");
    const observation = JSON.parse(row.payload_json) as {
      sourceItemKey: string; outboundLinks: string[]; summary: string
    };
    if (!/^github:[0-9]+$/.test(observation.sourceItemKey) ||
        !observation.outboundLinks.includes("https://github.com/vrc-get/vrc-get") ||
        observation.summary !== "" || !row.source_profile_id ||
        !db.prepare("SELECT 1 FROM source_access_profiles WHERE profile_id=?").get(row.source_profile_id)) {
      throw new Error("Persisted GitHub evidence lacks reviewed profile attribution, source link, or prose minimization");
    }
    console.log(JSON.stringify({ source: sourceUrl, sourceItemKey: observation.sourceItemKey,
      coordinatorPid: server.pid, nodeOutcome: "changed" }));
  } finally { db.close(true); }
} finally {
  if (server) { server.kill(); await server.exited; }
  if (realpathSync(smokeDir) !== resolvedSmokeDir || !resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) {
    throw new Error("Refusing to remove unexpected smoke path");
  }
  rmSync(resolvedSmokeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
