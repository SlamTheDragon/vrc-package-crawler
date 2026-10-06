import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { recoveryIdentity, recoveryRunMatches, checkRecoveryRun, checkRecoveryRetry, checkRecoveryReceipts, requireRecoveryCI, ciSourceCommit, authorizeRecovery } from "../scripts/delivery-recovery.mjs";
import { deliveryTroubleshooting } from "../scripts/delivery-chain.mjs";

function fixture(tag = "vrcp-crawler/v0.0.6") {
  const identity = recoveryIdentity(tag);
  const workflow = { crawler: "node-docker", network: "network", "crawler-client": "node-client" }[identity.product];
  const toolingCommit = "a".repeat(40);
  const run = { id: 99, event: "workflow_dispatch", head_branch: "main", head_sha: toolingCommit,
    head_repository: { full_name: identity.repository }, path: `.github/workflows/${workflow}.yml`,
    display_title: `Recover ${identity.product} ${identity.tag}`, actor: { type: "User", login: "SlamTheDragon" } };
  const prefix = `/repos/${identity.repository}`;
  const responses: Record<string, any> = {
    [`${prefix}/compare/${toolingCommit}...main`]: { status: "identical", base_commit: { sha: toolingCommit }, merge_base_commit: { sha: toolingCommit } },
    [`${prefix}/contents/.github/delivery-recoveries.json?ref=${toolingCommit}`]: {
      type: "file", path: ".github/delivery-recoveries.json", encoding: "base64",
      content: Buffer.from(readFileSync(new URL("../.github/delivery-recoveries.json", import.meta.url))).toString("base64") },
    [`${prefix}/actions/runs/${identity.failedRun}`]: { event: "push", head_branch: identity.tag, head_sha: identity.commit,
      path: run.path, head_repository: run.head_repository, status: "completed", conclusion: "failure" },
    [`${prefix}/actions/runs/${identity.failedRun}/jobs?per_page=100`]: { total_count: 2,
      jobs: [{ name: identity.product === "crawler" ? "route" : "build", conclusion: "failure" },
        { name: "release-assets", conclusion: "skipped" }] },
    [`${prefix}/actions/runs/${identity.failedRun}/artifacts?per_page=100`]: { total_count: 0, artifacts: [] },
  };
  const api = async (path: string) => {
    if (!Object.hasOwn(responses, path)) throw new Error(`Unexpected recovery read: ${path}`);
    return structuredClone(responses[path]);
  };
  return { identity, run, prefix, responses, api, toolingCommit };
}

test("only the exact approved failed crawler identity can enter recovery", () => {
  const f = fixture();
  expect(f.identity.commit).toBe("995db61eeafdf9a51f09902387411b258080fdc3");
  expect(f.identity.tagObject).toBe("41039d1f0020a95eda00cd898654d35c093bde25");
  for (const tag of ["vrcp-crawler/v0.0.9", "vrcp-api/v0.0.6", "vrcp-crawler/v0.0.6-retry1", "__proto__"]) {
    expect(() => recoveryIdentity(tag)).toThrow("exact owner-reviewed");
  }
  expect(ciSourceCommit({ GITHUB_SHA: f.toolingCommit } as any)).toBe(f.toolingCommit);
  expect(ciSourceCommit({ GITHUB_SHA: f.toolingCommit, VRCP_RECOVERY_TAG: f.identity.tag } as any)).toBe(f.identity.commit);
});

test("recovery binds an owner-dispatched main attempt to reviewed tooling and the original failed route", async () => {
  const f = fixture();
  expect(await checkRecoveryRun(f.run, f.identity, f.api)).toEqual({ ...f.identity, toolingCommit: f.toolingCommit, recoveryRun: 99 });
  for (const changes of [ { event: "push" }, { head_branch: "preview" }, { path: ".github/workflows/other.yml" },
    { head_sha: "bad" }, { display_title: "another attempt" }, { actor: { type: "Bot", login: "SlamTheDragon" } },
    { actor: { type: "User", login: "other" } }, { head_repository: { full_name: "fork/repo" } } ]) {
    expect(recoveryRunMatches({ ...f.run, ...changes }, f.identity)).toBe(false);
    await expect(checkRecoveryRun({ ...f.run, ...changes }, f.identity, f.api)).rejects.toThrow("owner on reviewed main");
  }
});

test("exact preview recoveries retain failed source and reject changed stages or outputs", async () => {
  for (const tag of ["vrcp-network/v2026.10.4", "vrcp-crawler-client/v26.10.5-pre"]) {
    const f = fixture(tag);
    const proof = await checkRecoveryRun(f.run, f.identity, f.api);
    expect(proof.commit).toBe(f.identity.commit);
    expect(proof.tagObject).toBe(f.identity.tagObject);
    const name = f.identity.product === "network" ? `vrc-packages-network-${f.identity.version}.tgz.json` : "crawler-client.receipt.json";
    const receipt = { commit: proof.commit, recovery: { toolingCommit: proof.toolingCommit,
      sourceRun: proof.recoveryRun, failedRun: proof.failedRun } };
    const files = new Map([[name, Buffer.from(JSON.stringify(receipt))]]);
    expect(() => checkRecoveryReceipts(files, proof)).not.toThrow();
    receipt.recovery.toolingCommit = "b".repeat(40);
    expect(() => checkRecoveryReceipts(new Map([[name, Buffer.from(JSON.stringify(receipt))]]), proof)).toThrow();
    f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`].jobs[1].conclusion = "success";
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
    expect(recoveryRunMatches({ ...f.run, head_branch: "preview" }, f.identity)).toBe(false);
  }
});

test("GitHub's terminal acknowledgment record does not become a prior publication job", async () => {
  const f = fixture("vrcp-crawler-client/v26.10.5-pre");
  const jobs = f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`];
  const job = { id: 123, name: `VRCP Discord release: ${f.identity.tag}`, runner_id: null,
    labels: [], status: "completed", conclusion: "success" };
  jobs.jobs.push(job); jobs.total_count++;
  const check = { id: job.id, name: job.name, head_sha: f.identity.commit, status: "completed", conclusion: "success",
    external_id: "discord:123456", app: { slug: "github-actions" } };
  f.responses[`${f.prefix}/check-runs/123`] = check;
  expect((await checkRecoveryRun(f.run, f.identity, f.api)).commit).toBe(f.identity.commit);
  for (const change of [{ head_sha: "b".repeat(40) }, { external_id: "release:123" },
    { app: { slug: "other" } }, { conclusion: "failure" }, { name: "another check" }]) {
    f.responses[`${f.prefix}/check-runs/123`] = { ...check, ...change };
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("Terminal check identity");
  }
  f.responses[`${f.prefix}/check-runs/123`] = check;
  job.runner_id = 1 as any;
  await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("Unverified terminal");
  job.runner_id = null;
  jobs.jobs.push({ name: "publish", conclusion: "success" }); jobs.total_count++;
  await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
});

test("crawler dependency recovery permits only the exact output-free preparation failure", async () => {
  const f = fixture("vrcp-crawler/v0.0.7");
  const path = `${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`;
  const steps = [
    { name: "Run bun test ./tests", number: 8, status: "completed", conclusion: "success" },
    { name: "Run node scripts/delivery.mjs prepare 'release' crawler --ci", number: 9, status: "completed", conclusion: "failure" },
    { name: "Verify package contracts and node", number: 10, status: "completed", conclusion: "skipped" },
    { name: "Post Checkout repository", number: 20, status: "completed", conclusion: "success" }
  ];
  const jobs = [ { name: "route", conclusion: "success" },
    ...["build-linux", "standalone-windows"].map(name => {
      const cloned = structuredClone(steps);
      if (name === "standalone-windows") cloned[3].name = "Post Run actions/checkout@v4";
      return { name, conclusion: "failure", steps: cloned };
    }),
    { name: "publish-container", conclusion: "skipped" }, { name: "release-assets", conclusion: "skipped" } ];
  f.responses[path] = { total_count: jobs.length, jobs };
  expect((await checkRecoveryRun(f.run, f.identity, f.api)).failedStage).toBe("dependency-prepare");
  for (const mutate of [
    (j: any[]) => { j[1].steps[1].name = "Build product"; },
    (j: any[]) => { j[2].steps[2].conclusion = "success"; },
    (j: any[]) => { j[1].steps[0].conclusion = "failure"; },
    (j: any[]) => { j[1].steps = undefined; },
    (j: any[]) => { j[4].conclusion = "success"; },
    (j: any[]) => { j[0].conclusion = "failure"; },
    (j: any[]) => { j[2].name = "build-linux"; },
    (j: any[]) => { j[1].steps[3].name = "Post Build product"; },
    (j: any[]) => { j[1].steps[2].number = 8; },
    (j: any[]) => { j[1].steps[0].number = 0; },
    (j: any[]) => { j[1].steps.reverse(); },
    (j: any[]) => { j[1].steps[2].name = steps[1].name; }
  ]) {
    const changed = structuredClone(jobs); mutate(changed);
    f.responses[path] = { total_count: changed.length, jobs: changed };
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow("no publication");
  }
  f.responses[path] = { total_count: jobs.length, jobs };
  const retryJobsPath = `${f.prefix}/actions/runs/99/jobs?per_page=100`;
  f.responses[retryJobsPath] = structuredClone(f.responses[path]);
  f.responses[`${f.prefix}/actions/runs/99/artifacts?per_page=100`] = { total_count: 0, artifacts: [] };
  const attempt = { ...f.run, status: "completed", conclusion: "failure" };
  expect(await checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).toEqual([99]);
  f.responses[retryJobsPath].jobs[1].steps[1].name = "Build product";
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("publication activity");
});

test("recovery rejects changed authorization, missing ancestry, prior builds and partial artifacts", async () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.responses[`${f.prefix}/compare/${f.toolingCommit}...main`].status = "diverged"; },
    f => { f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${f.toolingCommit}`].content = Buffer.from('{"schemaVersion":1,"repository":"SlamTheDragon/vrc-packages","tags":{}}').toString("base64"); },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}`].head_sha = f.toolingCommit; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/jobs?per_page=100`].jobs[1].conclusion = "success"; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/artifacts?per_page=100`].total_count = 1; },
    f => { f.responses[`${f.prefix}/actions/runs/${f.identity.failedRun}/artifacts?per_page=100`].artifacts = [{}]; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    await expect(checkRecoveryRun(f.run, f.identity, f.api)).rejects.toThrow();
  }
});

test("manual recovery retry rejects active, unchanged-tooling and publication-output attempts", async () => {
  const f = fixture();
  const attempt = { ...f.run, status: "completed", conclusion: "failure" };
  const jobsPath = `${f.prefix}/actions/runs/99/jobs?per_page=100`;
  f.responses[jobsPath] = { total_count: 3, jobs: [
    { name: "route", conclusion: "success" }, { name: "build-linux", conclusion: "failure" },
    { name: "publish-container", conclusion: "skipped" }] };
  // Build artifacts alone no longer block a retry; only publication activity does.
  expect(await checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).toEqual([99]);
  await expect(checkRecoveryRetry([], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  await expect(checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api)).rejects.toThrow("different reviewed tooling");
  await expect(checkRecoveryRetry([{ ...attempt, status: "in_progress" }], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  // Publication job running must still block retry.
  f.responses[jobsPath].jobs[2].conclusion = "failure";
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("publication activity");
  f.responses[jobsPath].jobs[2].conclusion = "skipped";
  f.responses[jobsPath].total_count = 4;
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("incomplete evidence");
});

test("a recovery environment variable cannot turn a local or non-main job into a release", async () => {
  const f = fixture();
  const env = { VRCP_RECOVERY_TAG: f.identity.tag, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main", GITHUB_SHA: f.toolingCommit, GITHUB_REPOSITORY: f.identity.repository, GITHUB_RUN_ID: "99" };
  for (const changes of [{ GITHUB_ACTIONS: "false" }, { GITHUB_REF: "refs/heads/preview" }, { GITHUB_EVENT_NAME: "push" },
    { GITHUB_REPOSITORY: "other/repo" }, { GITHUB_RUN_ID: "" }]) {
    await expect(requireRecoveryCI("crawler", "release", { ...env, ...changes }, ".", f.api)).rejects.toThrow("dedicated owner-dispatched");
  }
  await expect(requireRecoveryCI("crawler", "preview", env, ".", f.api)).rejects.toThrow("dedicated owner-dispatched");
  f.responses[`${f.prefix}/actions/runs/99`] = f.run;
  await expect(requireRecoveryCI("crawler", "release", env, ".", f.api, () => f.toolingCommit))
    .rejects.toThrow("product source or saved version configs");
  await expect(requireRecoveryCI("crawler", "release", env, ".", f.api,
    (_workspace: string, action: string) => action === "rev-parse" ? f.identity.commit : "changed source"))
    .rejects.toThrow("product source or saved version configs");
});

test("crawler recovery stays in the existing chain and preserves publication approval and source checkout", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/node-docker.yml", import.meta.url), "utf8"));
  expect(workflow.on.workflow_dispatch.inputs["recovery-tag"].required).toBe(true);
  expect(workflow.env.VRCP_RECOVERY_TAG).toBe("${{ inputs.recovery-tag || '' }}");
  for (const name of ["route", "build-linux", "standalone-windows", "publish-container"]) {
    const steps = workflow.jobs[name].steps;
    expect(steps.find((step: any) => step.uses === "actions/checkout@v4").with.ref).toBe("${{ inputs.recovery-tag || github.ref }}");
    const install = steps.find((step: any) => step.name === "Restore reviewed recovery tooling only");
    expect(install.if).toBe("inputs.recovery-tag != ''");
    expect(install.run).toContain('git restore --source="$GITHUB_SHA" --worktree --no-overlay -- scripts tests package.json .github');
    expect(install.run).not.toContain("src-crawler");
  }
  expect(workflow.jobs["publish-container"].environment.name).toContain("vrcp-crawler-release");
  expect(workflow.jobs["release-assets"].needs).toContain("publish-container");
  expect(workflow.jobs["release-assets"].with.tag).toBe("${{ inputs.recovery-tag || '' }}");
  const rootScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  expect(rootScripts["delivery:recover"]).toBe("node scripts/delivery-recovery.mjs");
});

test("the real recovery CLI reaches metadata reads without an unsettled ESM entry point", () => {
  const directory = mkdtempSync(join(tmpdir(), "vrcp-recovery-cli-"));
  try {
    const preload = join(directory, "offline-metadata.mjs");
    // This entry-point test must not depend on historical objects in a shallow checkout.
    // Supply only its historical config reads. The production Git reader stays unchanged.
    const identity = recoveryIdentity("vrcp-crawler/v0.0.6");
    const configs = Object.fromEntries(["config.versions.json", "config.preview.versions.json"].map(path => {
      const config = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
      if (path === "config.versions.json") config["release-crawler"] = "0.0.6";
      return [`${identity.commit}:${path}`, JSON.stringify(config)];
    }));
    writeFileSync(preload, `import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const original = childProcess.execFileSync;
const configs = ${JSON.stringify(configs)};
childProcess.execFileSync = function(file, args, options) {
  if (file === "git" && args[0] === "show" && Object.hasOwn(configs, args[1])) return configs[args[1]];
  return original(file, args, options);
};
syncBuiltinESMExports();
globalThis.fetch = async () => new Response("{}", {status: 503});
`);
    const result = spawnSync("node", ["--import", pathToFileURL(preload).href, "scripts/delivery-recovery.mjs", "vrcp-crawler/v0.0.6"],
      { encoding: "utf8", timeout: 20_000, env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "" } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("503");
    expect(result.stderr).not.toContain("unsettled top-level await");
  } finally { rmSync(directory, { recursive: true }); }
});

test("troubleshooting adapts to observed phases without authorizing blind retries", () => {
  for (const [status, job, stage] of [
    ["ci-failed", "route", "routing"], ["ci-failed", "build-linux", "build-or-runtime-check"],
    ["ci-failed", "publish-container", "publication"], ["ci-failed", "release-assets / attach", "release-attachment"],
    ["ci-active-or-awaiting-environment", "publish-container", "execution-or-review-pending"],
    ["awaiting-npm-owner-approval", "publish", "npm-staging"], ["ci-not-observed", "", "tag-trigger"] ]) {
    const result = deliveryTroubleshooting({ tag: "vrcp-crawler/v0.0.6", status,
      jobs: job ? [{ name: job, conclusion: "failure" }] : [] });
    expect(result.stage).toBe(stage);
    expect(result.readOnly).toBe(true);
    expect(result.automaticRetry).toBe(false);
    expect(result.next.every((command: string) => !command.includes("--execute"))).toBe(true);
  }
  const unknown = deliveryTroubleshooting({ tag: "vrcp-crawler/v0.0.9", status: "ci-failed", jobs: [] });
  expect(unknown.next.join("\n")).not.toContain("delivery:recover");
});

test("public recovery receipts bind both binaries to source, reviewed tooling and the exact attempt", async () => {
  const f = fixture(), proof = await checkRecoveryRun(f.run, f.identity, f.api);
  const recovery = { toolingCommit: f.toolingCommit, sourceRun: 99, failedRun: f.identity.failedRun };
  const files = () => new Map(["crawler-linux.receipt.json", "crawler-windows.receipt.json"].map(name =>
    [name, Buffer.from(JSON.stringify({ commit: f.identity.commit, recovery }))]));
  expect(() => checkRecoveryReceipts(files(), proof)).not.toThrow();
  for (const changes of [{ toolingCommit: f.identity.commit }, { sourceRun: 100 }, { failedRun: 1 }, { unexpected: true }]) {
    const altered = files();
    altered.set("crawler-linux.receipt.json", Buffer.from(JSON.stringify({ commit: f.identity.commit, recovery: { ...recovery, ...changes } })));
    expect(() => checkRecoveryReceipts(altered, proof)).toThrow("Recovery receipt differs");
  }
  const absent = files(); absent.delete("crawler-windows.receipt.json");
  expect(() => checkRecoveryReceipts(absent, proof)).toThrow("missing");
});

test("authorizeRecovery resolves tag data and produces a valid manifest entry without manual JSON editing", async () => {
  const f = fixture();
  const tag = "vrcp-crawler/v0.0.8";
  const commit = "69387f5944a18819be763d80201c0cc7197cc717";
  const tagObject = "54dcc2f18367530ce18cdededc5142cb4ca5b3b7";
  const failedRunId = 37513932543;
  const api = async (path: string) => {
    if (path.includes(`/git/refs/tags/${tag}`))
      return { ref: `refs/tags/${tag}`, object: { type: "tag", sha: tagObject } };
    if (path.includes(`/git/tags/${tagObject}`))
      return { object: { sha: commit } };
    if (path.includes(`/actions/runs/${failedRunId}`))
      return { event: "push", head_branch: tag, head_sha: commit, status: "completed", conclusion: "failure" };
    throw new Error(`Unexpected authorize read: ${path}`);
  };
  const result = await authorizeRecovery(tag, { execute: false, failedRunId }, f.prefix.split("/repos/")[1] ? undefined : undefined, api);
  expect(result.status).toBe("authorize-plan");
  expect(result.readOnly).toBe(true);
  expect(result.entry.product).toBe("crawler");
  expect(result.entry.version).toBe("0.0.8");
  expect(result.entry.commit).toBe(commit);
  expect(result.entry.tagObject).toBe(tagObject);
  expect(result.entry.failedRun).toBe(failedRunId);
  expect(result.next).toContain("--execute");
  // Rejects unknown product prefix
  await expect(authorizeRecovery("unknown/v0.0.1", {}, undefined, api)).rejects.toThrow("recoverable product prefix");
});

test("retry allows prior build artifacts when no publication activity occurred", async () => {
  const f = fixture();
  const retryTooling = "b".repeat(40);
  const attempt = { id: 200, event: "workflow_dispatch", head_branch: "main",
    head_sha: retryTooling, head_repository: f.run.head_repository,
    path: f.run.path, display_title: f.run.display_title,
    actor: f.run.actor, status: "completed", conclusion: "failure" };
  // Wire ancestry and manifest reads for the recovery attempt's head_sha.
  f.responses[`${f.prefix}/compare/${retryTooling}...main`] =
    { status: "identical", base_commit: { sha: retryTooling }, merge_base_commit: { sha: retryTooling } };
  f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${retryTooling}`] =
    f.responses[`${f.prefix}/contents/.github/delivery-recoveries.json?ref=${f.toolingCommit}`];
  const jobsPath = `${f.prefix}/actions/runs/200/jobs?per_page=100`;
  f.responses[jobsPath] = { total_count: 3, jobs: [
    { name: "route", conclusion: "success" },
    { name: "standalone-windows", conclusion: "success" },
    { name: "build-linux", conclusion: "failure" }
  ]};
  // Should NOT throw — Windows build artifact existed but no publication ran.
  // retryTooling differs from f.toolingCommit so same-tooling guard passes.
  const retryOf = await checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api);
  expect(retryOf).toEqual([200]);
  // Publication job running must still block retry.
  f.responses[jobsPath].jobs[2] = { name: "publish-container", conclusion: "success" };
  f.responses[jobsPath].total_count = 3;
  await expect(checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api))
    .rejects.toThrow("publication activity");
});

