import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unusedLoopbackPort } from "./loopback_port.ts";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";

const smokeDir = mkdtempSync(join(tmpdir(), "vrc-multi-coordinator-"));
const resolvedSmokeDir = realpathSync(smokeDir);
if (!resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) throw new Error("Smoke directory escaped system temp");
const dbPath = join(resolvedSmokeDir, "coordinator.db");
const coordinatorBinary = resolve(existsSync("dist/local-coordinator/vrc-coordinator.exe") ?
  "dist/local-coordinator/vrc-coordinator.exe" : "dist/vrc-coordinator.exe");
const env: Record<string, string | undefined> = { ...process.env, COORDINATOR_DB_PATH: dbPath };
const servers: Array<ReturnType<typeof Bun.spawn>> = [];

function coordinatorCommand(args: string[]): string {
  const result = Bun.spawnSync([coordinatorBinary, ...args], { env });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout);
}

function fixtureProfile(platform: "vpm" | "booth", target: string): void {
  const url = new URL(target);
  coordinatorCommand(["profile-create", JSON.stringify({ schemaVersion: 1, platform,
    origin: url.origin, pathScope: url.pathname, method: "GET", purpose: "metadata",
    minDelayMs: 1000, expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "isolated-multi-process-fixture", reason: "Synthetic offline protocol smoke",
    retainClasses: ["normalized_facts", "creator_prose"], publishClasses: [] })]);
}

async function startCoordinator(): Promise<number> {
  const port = await unusedLoopbackPort();
  const server = Bun.spawn([coordinatorBinary, "serve", String(port)], { env, stdout: "pipe", stderr: "pipe" });
  servers.push(server);
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/node/jobs/claim`);
      const body = await response.json() as { code?: string };
      if (response.status === 404 && body.code === "not_found") return port;
    } catch { /* Wait for process startup. */ }
    await Bun.sleep(100);
  }
  throw new Error("Compiled coordinator did not start");
}

async function post(port: number, path: string, token: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000)
  });
  return { status: response.status, body: await response.json() };
}

try {
  const aToken = (JSON.parse(coordinatorCommand(["register", "node-a", "vpm"])) as { token: string }).token;
  const bToken = (JSON.parse(coordinatorCommand(["register", "node-b", "vpm"])) as { token: string }).token;
  fixtureProfile("vpm", "https://same-origin.example.org/a");
  fixtureProfile("vpm", "https://same-origin.example.org/b");
  coordinatorCommand(["seed", "vpm", "https://same-origin.example.org/a", "1000"]);
  coordinatorCommand(["seed", "vpm", "https://same-origin.example.org/b", "1000"]);
  const fixtures = new LocalCoordinatorStore(dbPath);
  try { fixtures.recordRobotsSnapshot("https://same-origin.example.org", 404); }
  finally { fixtures.close(); }
  const aPort = await startCoordinator();
  const bPort = await startCoordinator();
  const claimCalls = Array.from({ length: 24 }, (_, index) => {
    const nodeId = index % 2 ? "node-b" : "node-a";
    const token = index % 2 ? bToken : aToken;
    return post(index % 2 ? bPort : aPort, "/v1/node/jobs/claim", token,
      { schemaVersion: 1, nodeId, capabilities: ["vpm"] }).then((response) => ({ nodeId, token, response }));
  });
  const claims = await Promise.all(claimCalls);
  if (claims.some(({ response }) => response.status !== 200)) {
    throw new Error(`Concurrent claim failed: ${JSON.stringify(claims.map(({ response }) => response.status))}`);
  }
  const leased = claims.filter(({ response }) => response.body.status === "leased");
  if (leased.length !== 1 || claims.some(({ response }) => !["leased", "empty"].includes(response.body.status))) {
    throw new Error(`Expected exactly one same-origin lease, found ${leased.length}`);
  }
  const winner = leased[0];
  const job = winner.response.body.job as { jobId: string; leaseId: string };
  const result = { schemaVersion: 1, nodeId: winner.nodeId, jobId: job.jobId, leaseId: job.leaseId,
    idempotencyKey: "concurrent-result-on-two-processes", outcome: { kind: "unchanged" } };
  const submissions = await Promise.all([
    post(aPort, "/v1/node/jobs/result", winner.token, result),
    post(bPort, "/v1/node/jobs/result", winner.token, result)
  ]);
  if (submissions.some(({ status }) => status !== 200) ||
    submissions.filter(({ body }) => body.duplicate === false).length !== 1 ||
    submissions.filter(({ body }) => body.duplicate === true).length !== 1) {
    throw new Error(`Concurrent duplicate submission failed: ${JSON.stringify(submissions)}`);
  }
  const boothToken = (JSON.parse(coordinatorCommand(["register", "booth-node", "booth"])) as { token: string }).token;
  const suppressedUrl = "https://suppressed.example.org/item";
  fixtureProfile("booth", suppressedUrl);
  coordinatorCommand(["seed", "booth", suppressedUrl, "1000"]);
  const boothFixture = new LocalCoordinatorStore(dbPath);
  try { boothFixture.recordRobotsSnapshot("https://suppressed.example.org", 404); }
  finally { boothFixture.close(); }
  const boothClaim = await post(aPort, "/v1/node/jobs/claim", boothToken,
    { schemaVersion: 1, nodeId: "booth-node", capabilities: ["booth"] });
  if (boothClaim.status !== 200 || boothClaim.body.status !== "leased") throw new Error("Could not lease suppression test job");
  coordinatorCommand(["suppress", suppressedUrl, "operator", "opt-out"]);
  const blockedResult = await post(bPort, "/v1/node/jobs/result", boothToken, {
    schemaVersion: 1, nodeId: "booth-node", jobId: boothClaim.body.job.jobId,
    leaseId: boothClaim.body.job.leaseId, idempotencyKey: "cross-process-suppressed-result",
    outcome: { kind: "unchanged" }
  });
  if (blockedResult.status !== 403) throw new Error(`Suppressed lease was accepted: ${blockedResult.status}`);
  const blockedClaim = await post(bPort, "/v1/node/jobs/claim", boothToken,
    { schemaVersion: 1, nodeId: "booth-node", capabilities: ["booth"] });
  if (blockedClaim.status !== 200 || blockedClaim.body.status !== "empty") throw new Error("Suppressed URL was re-leased");

  // Simulate an abrupt coordinator death while a node job is leased. The
  // surviving process must recover it after expiry and reject the stale owner.
  const recoveryUrl = "https://recovery.example.org/item";
  fixtureProfile("vpm", recoveryUrl);
  coordinatorCommand(["seed", "vpm", recoveryUrl, "1000"]);
  const recoveryFixture = new LocalCoordinatorStore(dbPath);
  try {
    recoveryFixture.recordRobotsSnapshot("https://recovery.example.org", 404);
    recoveryFixture.db.prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE origin=?")
      .run("2099-01-01T00:00:00.000Z", "https://same-origin.example.org");
  }
  finally { recoveryFixture.close(); }
  const crashedClaim = await post(aPort, "/v1/node/jobs/claim", aToken,
    { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
  if (crashedClaim.status !== 200 || crashedClaim.body.status !== "leased" ||
      crashedClaim.body.job.url !== recoveryUrl) {
    throw new Error(`Could not lease recovery test job: ${JSON.stringify(crashedClaim)}`);
  }
  servers[0].kill("SIGKILL");
  await servers[0].exited;
  const expiredLease = "1970-01-01T00:00:00.000Z";
  const recoveryStore = new LocalCoordinatorStore(dbPath);
  try {
    recoveryStore.db.prepare("UPDATE crawl_jobs SET lease_expires_at=? WHERE job_id=?")
      .run(expiredLease, crashedClaim.body.job.jobId);
    recoveryStore.db.prepare("UPDATE origin_leases SET lease_expires_at=?,next_allowed_at=? WHERE origin=?")
      .run(expiredLease, expiredLease, "https://recovery.example.org");
  } finally { recoveryStore.close(); }
  const recoveredClaim = await post(bPort, "/v1/node/jobs/claim", bToken,
    { schemaVersion: 1, nodeId: "node-b", capabilities: ["vpm"] });
  if (recoveredClaim.status !== 200 || recoveredClaim.body.status !== "leased" ||
      recoveredClaim.body.job.jobId !== crashedClaim.body.job.jobId ||
      recoveredClaim.body.job.leaseId === crashedClaim.body.job.leaseId) {
    throw new Error(`Surviving coordinator did not replace the crashed lease: ${JSON.stringify(recoveredClaim)}`);
  }
  const staleResult = await post(bPort, "/v1/node/jobs/result", aToken, {
    schemaVersion: 1, nodeId: "node-a", jobId: crashedClaim.body.job.jobId,
    leaseId: crashedClaim.body.job.leaseId, idempotencyKey: "crashed-old-lease",
    outcome: { kind: "unchanged" }
  });
  if (staleResult.status !== 403) throw new Error(`Crashed node's stale result was accepted: ${staleResult.status}`);
  const recoveredResult = await post(bPort, "/v1/node/jobs/result", bToken, {
    schemaVersion: 1, nodeId: "node-b", jobId: recoveredClaim.body.job.jobId,
    leaseId: recoveredClaim.body.job.leaseId, idempotencyKey: "surviving-recovery-result",
    outcome: { kind: "unchanged" }
  });
  if (recoveredResult.status !== 200 || recoveredResult.body.duplicate !== false) {
    throw new Error(`Recovered lease result was not accepted: ${JSON.stringify(recoveredResult)}`);
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const jobResults = (db.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n;
    const events = (db.prepare("SELECT count(*) AS n FROM source_events").get() as { n: number }).n;
    if (jobResults !== 2 || events !== 3) throw new Error(`Expected two results and three events, got ${jobResults}/${events}`);
    console.log(JSON.stringify({ coordinatorProcesses: 2, concurrentClaims: claims.length,
      sameOriginLeases: leased.length, acceptedSubmissions: submissions.length, duplicateSubmissions: 1,
      crossProcessSuppressedSubmitStatus: blockedResult.status, staleCrashSubmitStatus: staleResult.status,
      recoveredSubmissionStatus: recoveredResult.status, persistedResults: jobResults, persistedEvents: events }));
  } finally { db.close(true); }
} finally {
  for (const server of servers) { server.kill(); await server.exited; }
  if (realpathSync(smokeDir) !== resolvedSmokeDir || !resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) {
    throw new Error("Refusing to remove unexpected smoke path");
  }
  rmSync(resolvedSmokeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
