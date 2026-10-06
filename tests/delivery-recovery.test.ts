import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { recoveryIdentity, recoveryRunMatches, checkRecoveryRun, requireRecoveryCI, ciSourceCommit } from "../scripts/delivery-recovery.mjs";

function fixture() {
  const identity = recoveryIdentity("vrcp-crawler/v0.0.6");
  const toolingCommit = "a".repeat(40);
  const run = { id: 99, event: "workflow_dispatch", head_branch: "main", head_sha: toolingCommit,
    head_repository: { full_name: identity.repository }, path: ".github/workflows/node-docker.yml",
    display_title: `Recover crawler ${identity.tag}`, actor: { type: "User", login: "SlamTheDragon" } };
  const prefix = `/repos/${identity.repository}`;
  const responses: Record<string, any> = {
    [`${prefix}/compare/${toolingCommit}...main`]: { status: "identical", base_commit: { sha: toolingCommit }, merge_base_commit: { sha: toolingCommit } },
    [`${prefix}/contents/.github/delivery-recoveries.json?ref=${toolingCommit}`]: {
      type: "file", path: ".github/delivery-recoveries.json", encoding: "base64",
      content: Buffer.from(readFileSync(new URL("../.github/delivery-recoveries.json", import.meta.url))).toString("base64") },
    [`${prefix}/actions/runs/${identity.failedRun}`]: { event: "push", head_branch: identity.tag, head_sha: identity.commit,
      path: run.path, head_repository: run.head_repository, status: "completed", conclusion: "failure" },
    [`${prefix}/actions/runs/${identity.failedRun}/jobs?per_page=100`]: { total_count: 2,
      jobs: [{ name: "route", conclusion: "failure" }, { name: "build-linux", conclusion: "skipped" }] },
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
    expect(install.run).toContain('git archive "$GITHUB_SHA" scripts tests package.json');
    expect(install.run).not.toContain("src-crawler");
  }
  expect(workflow.jobs["publish-container"].environment.name).toContain("vrcp-crawler-release");
  expect(workflow.jobs["release-assets"].needs).toContain("publish-container");
  expect(workflow.jobs["release-assets"].with.tag).toBe("${{ inputs.recovery-tag || '' }}");
  const rootScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  expect(rootScripts["delivery:recover"]).toBe("node scripts/delivery-recovery.mjs");
});
