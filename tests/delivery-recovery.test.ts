import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { recoveryIdentity, recoveryRunMatches, checkRecoveryRun, checkRecoveryRetry, checkRecoveryReceipts, requireRecoveryCI, ciSourceCommit } from "../scripts/delivery-recovery.mjs";
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
  for (const tag of ["vrcp-crawler/v0.0.7", "vrcp-api/v0.0.6", "vrcp-crawler/v0.0.6-retry1", "__proto__"]) {
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

test("manual recovery retry rejects active, unchanged-tooling and partial-output attempts", async () => {
  const f = fixture();
  const attempt = { ...f.run, status: "completed", conclusion: "failure" };
  const jobsPath = `${f.prefix}/actions/runs/99/jobs?per_page=100`;
  const artifactsPath = `${f.prefix}/actions/runs/99/artifacts?per_page=100`;
  f.responses[jobsPath] = { total_count: 3, jobs: [
    { name: "route", conclusion: "success" }, { name: "build-linux", conclusion: "failure" },
    { name: "publish-container", conclusion: "skipped" }] };
  f.responses[artifactsPath] = { total_count: 0, artifacts: [] };
  expect(await checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).toEqual([99]);
  await expect(checkRecoveryRetry([], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  await expect(checkRecoveryRetry([attempt], f.identity, f.toolingCommit, f.api)).rejects.toThrow("different reviewed tooling");
  await expect(checkRecoveryRetry([{ ...attempt, status: "in_progress" }], f.identity, "b".repeat(40), f.api)).rejects.toThrow();
  f.responses[artifactsPath] = { total_count: 1, artifacts: [{}] };
  await expect(checkRecoveryRetry([attempt], f.identity, "b".repeat(40), f.api)).rejects.toThrow("outputs");
  f.responses[artifactsPath] = { total_count: 0, artifacts: [] };
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
  const unknown = deliveryTroubleshooting({ tag: "vrcp-crawler/v0.0.8", status: "ci-failed", jobs: [] });
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
