import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/preview-delivery.yml", import.meta.url), "utf8"));
const steps = workflow.jobs.allocate.steps;
const diagnostic = steps.find((step: any) => step.name === "Check preview allocation without writes");

test("preview diagnostic retains required product, branch, App scope and first-attempt guards", () => {
  expect(workflow.on.workflow_dispatch.inputs.product.required).toBe(true);
  expect(workflow.on.workflow_dispatch.inputs["diagnose-only"]).toEqual({
    description: "Check App access and the synchronized branch preview plan without allocating a version.",
    required: false, type: "boolean", default: false
  });
  expect(workflow.jobs.allocate.if).toBe("github.ref_type == 'branch'");
  expect(steps[0].run).toContain('if [ "$GITHUB_RUN_ATTEMPT" != "1" ]; then');
  const app = steps.find((step: any) => step.id === "app");
  expect(app.if).toBeUndefined();
  expect(app.with).toEqual({
    "client-id": "${{ vars.VRCP_PREVIEW_APP_CLIENT_ID }}",
    "private-key": "${{ secrets.VRCP_PREVIEW_APP_PRIVATE_KEY }}",
    "permission-contents": "write"
  });
  const checkout = steps.find((step: any) => step.uses?.startsWith("actions/checkout@"));
  expect(checkout.if).toBeUndefined();
  expect(checkout.with).toEqual({ ref: "${{ github.ref_name }}", "fetch-depth": 0, token: "${{ steps.app.outputs.token }}" });
  const setup = steps.find((step: any) => step.run === "bun run setup");
  expect(setup.if).toBeUndefined();
  expect(steps.indexOf(setup)).toBeLessThan(steps.indexOf(diagnostic));
});

test("diagnostic plans into runner temporary storage while normal delivery alone can execute", () => {
  expect(diagnostic.if).toBe("inputs.diagnose-only");
  expect(diagnostic.run).toContain('bun run publish:preview "$VRCP_PREVIEW_PRODUCT" > "$RUNNER_TEMP/vrcp-preview-plan.json"');
  expect(diagnostic.run).not.toContain("--execute");
  expect(diagnostic.env).toEqual({ VRCP_PREVIEW_PRODUCT: "${{ inputs.product }}", VRCP_PREVIEW_BRANCH: "${{ github.ref_name }}" });
  for (const name of ["Configure preview commit identity", "Allocate one configured patch and queue tagged delivery"]) {
    expect(steps.find((step: any) => step.name === name).if).toBe("${{ !inputs.diagnose-only }}");
  }
  expect(steps.filter((step: any) => step.run?.includes("--execute"))).toHaveLength(1);
  expect(steps.find((step: any) => step.name === "Allocate one configured patch and queue tagged delivery").run)
    .toBe('bun run publish:preview "$VRCP_PREVIEW_PRODUCT" --execute');
});

test("diagnostic summary excludes private plan fields and rejects blockers or a non-planning result", () => {
  const script = /node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/.exec(diagnostic.run)?.[1];
  expect(script).toBeDefined();
  const parent = realpathSync(tmpdir()), directory = mkdtempSync(join(parent, "vrcp-preview-diagnostic-"));
  const summary = join(directory, "summary.txt");
  const selected = { branch: "feature-preview", product: "worker", version: "2026.10.7-pre", tag: "cloudflare-worker/v2026.10.7-pre" };
  const plan = { ...selected, purpose: "plan-only", channel: "preview", blockers: [],
    repository: "PRIVATE_TEST_VALUE", head: "PRIVATE_TEST_VALUE", configPath: "PRIVATE_TEST_VALUE" };
  const run = (value: unknown) => {
    writeFileSync(join(directory, "vrcp-preview-plan.json"), JSON.stringify(value));
    writeFileSync(summary, "");
    return spawnSync("node", ["--input-type=module"], { input: script, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, RUNNER_TEMP: directory, GITHUB_STEP_SUMMARY: summary,
        VRCP_PREVIEW_BRANCH: selected.branch, VRCP_PREVIEW_PRODUCT: selected.product } });
  };
  try {
    const result = run(plan);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(summary, "utf8"))).toEqual({ ...selected, result: "plan-only; zero delivery mutations" });
    expect(readFileSync(summary, "utf8")).not.toContain("PRIVATE_TEST_VALUE");
    for (const altered of [{ ...plan, purpose: "pushed" }, { ...plan, blockers: ["PRIVATE_TEST_VALUE"] },
      { ...plan, blockers: null }, { ...plan, branch: "other-branch" }, { ...plan, product: "crawler" }, { ...plan, channel: "release" }]) {
      const rejected = run(altered);
      expect(rejected.status).not.toBe(0);
      expect(readFileSync(summary, "utf8")).toBe("");
      expect(rejected.stdout + rejected.stderr).not.toContain("PRIVATE_TEST_VALUE");
    }
  } finally {
    if (lstatSync(directory).isSymbolicLink() || !realpathSync(directory).startsWith(parent + sep)) throw new Error("Unsafe diagnostic fixture cleanup");
    rmSync(directory, { recursive: true });
  }
});
