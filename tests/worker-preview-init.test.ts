import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { initializePreview, previewFetch, previewOrigin, requirePreviewInitialization } from "../scripts/worker-preview-init.mjs";

const env = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: "SlamTheDragon/vrc-packages",
  GITHUB_REF: "refs/heads/main", GITHUB_WORKFLOW_REF: "SlamTheDragon/vrc-packages/.github/workflows/worker-preview-init.yml@refs/heads/main",
  VRCP_WORKER_OPERATION_ENV: "cloudflare-preview", OPERATOR_TOKEN: "a".repeat(64) };

test("preview initialization rejects wrong scope or absent credentials before constructing a client", async () => {
  expect(() => requirePreviewInitialization(env)).not.toThrow();
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: "false", GITHUB_EVENT_NAME: "push", GITHUB_REPOSITORY: "foreign/repo",
    GITHUB_REF: "refs/heads/feature", GITHUB_WORKFLOW_REF: "other-workflow", VRCP_WORKER_OPERATION_ENV: "production", OPERATOR_TOKEN: "" })) {
    let constructed = false;
    await expect(initializePreview(class { constructor() { constructed = true; } }, { ...env, [key]: value })).rejects.toThrow();
    expect(constructed).toBe(false);
  }
});

test("only explicit disabled seeding followed by a single bounded public read can succeed", async () => {
  const calls: unknown[] = [];
  class Client {
    constructor(options: any) { calls.push({ origin: options.baseUrl, tokenPresent: !!options.operatorToken }); }
    operator = { init: async (params: unknown) => { calls.push(params); return { autoSeed: false }; } };
    index = { query: async (params: unknown) => { calls.push(params); return { schemaVersion: 1 }; } };
  }
  expect(await initializePreview(Client, env)).toEqual({ target: previewOrigin, autoSeed: false, schemaVersion: 1, catalogRead: "passed" });
  expect(calls).toEqual([{ origin: previewOrigin, tokenPresent: true }, { autoSeed: false }, { limit: 1 }]);
  let read = false;
  await expect(initializePreview(class {
    operator = { init: async () => ({ autoSeed: true }) };
    index = { query: async () => { read = true; } };
  }, env)).rejects.toThrow();
  expect(read).toBe(false);
});

test("transport rejects foreign targets, extra routes and unexpected queries before fetching", async () => {
  let requests = 0;
  const request = previewFetch(async () => { requests++; return Response.json({}); });
  for (const target of ["https://vrc-package-crawler.slamthedragon.workers.dev/v1/operator/init",
    `${previewOrigin}/v1/operator/jobs`, `${previewOrigin}/v1/operator/init?autoSeed=true`,
    `${previewOrigin}/v1/operator/init#fragment`, `${previewOrigin}/v1/app/index?limit=100`,
    "https://user:password@vrc-package-crawler-preview.slamthedragon.workers.dev/v1/operator/init"]) {
    await expect(request(target, { method: "POST" })).rejects.toThrow();
  }
  expect(requests).toBe(0);
});

test("transport denies redirects and bounds response bytes while retaining schema-readable JSON", async () => {
  const request = previewFetch(async (_input: unknown, options: any) => {
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ schemaVersion: 1 });
  });
  expect(await (await request(`${previewOrigin}/v1/app/index?limit=1`, { method: "GET" })).json()).toEqual({ schemaVersion: 1 });
  for (const response of [new Response("PRIVATE_REMOTE_ERROR", { status: 500 }),
    new Response(null, { status: 302, headers: { location: "https://foreign.example" } }),
    new Response("<html>", { headers: { "content-type": "text/html" } }),
    new Response("x".repeat(65537), { headers: { "content-type": "application/json" } })]) {
    await expect(previewFetch(async () => response)(`${previewOrigin}/v1/operator/init`, { method: "POST" })).rejects.toThrow();
  }
});

test("root CLI plans without secret or SDK setup and sanitizes invalid execution", () => {
  const run = (args: string[]) => spawnSync("bun", ["scripts/worker-preview-init.mjs", ...args], {
    encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "false", OPERATOR_TOKEN: "PRIVATE_FIXTURE_VALUE" }
  });
  const planned = run([]);
  expect(planned.status).toBe(0);
  expect(JSON.parse(planned.stdout).purpose).toBe("plan-only");
  const denied = run(["--execute"]);
  expect(denied.status).toBe(1);
  expect(planned.stdout + planned.stderr + denied.stdout + denied.stderr).not.toContain("PRIVATE_FIXTURE_VALUE");
});

test("manual initializer uses only main and preview secrets with root forwarding and no release mutations", () => {
  const workflow = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/worker-preview-init.yml", import.meta.url), "utf8"));
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  expect(workflow.jobs.initialize.if).toBe("github.ref == 'refs/heads/main'");
  expect(workflow.jobs.initialize.environment).toBe("cloudflare-preview");
  expect(workflow.permissions).toEqual({ contents: "read", actions: "read" });
  const steps = workflow.jobs.initialize.steps;
  expect(steps.at(-1).run).toBe("bun run worker:preview:init --execute");
  expect(steps.at(-1).env).toEqual({ OPERATOR_TOKEN: "${{ secrets.OPERATOR_TOKEN }}", VRCP_WORKER_OPERATION_ENV: "cloudflare-preview" });
  expect(JSON.stringify(steps)).not.toMatch(/git push|versions:bump|delivery:preview|wrangler deploy|CLOUDFLARE_API_TOKEN/);
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const worker = JSON.parse(readFileSync(new URL("../src-worker/package.json", import.meta.url), "utf8"));
  expect(root.scripts["worker:preview:init"]).toBe("bun scripts/worker-preview-init.mjs");
  expect(worker.scripts["preview:init"]).toBe("bun run --cwd .. worker:preview:init");
});
