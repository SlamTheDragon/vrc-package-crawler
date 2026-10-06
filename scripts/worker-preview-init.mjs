import { fileURLToPath, pathToFileURL } from "node:url";

// Fixed credential destination. A new origin requires an explicit target review.
export const previewOrigin = "https://vrc-package-crawler-preview.slamthedragon.workers.dev";

export function requirePreviewInitialization(env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_REPOSITORY !== "SlamTheDragon/vrc-packages" || env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_WORKFLOW_REF !== "SlamTheDragon/vrc-packages/.github/workflows/worker-preview-init.yml@refs/heads/main" ||
      env.VRCP_WORKER_OPERATION_ENV !== "cloudflare-preview" || !/^[a-f0-9]{64}$/i.test(env.OPERATOR_TOKEN ?? "")) {
    throw new Error("Preview initialization requires its main-ref manual workflow and protected operator secret");
  }
}

export function previewFetch(request = fetch) {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== previewOrigin || url.username || url.password || url.hash ||
        !(init?.method === "POST" && url.pathname === "/v1/operator/init" && !url.search ||
          init?.method === "GET" && url.pathname === "/v1/app/index" && url.search === "?limit=1")) {
      throw new Error("Unexpected preview initialization request");
    }
    if (init.method === "POST") {
      const body = JSON.parse(init.body);
      if (body?.schemaVersion !== 1 || body.autoSeed !== false || Object.keys(body).length !== 2) {
        throw new Error("Preview initialization must explicitly disable seeding");
      }
    }
    const response = await request(url.href, { ...init, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
      await response.body?.cancel();
      throw new Error("Preview initialization request failed");
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error("Preview response exceeds its size limit");
        chunks.push(value);
      }
    } catch {
      await reader.cancel().catch(() => {});
      throw new Error("Preview response could not be read within its limits");
    } finally { reader.releaseLock(); }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
  };
}

export async function initializePreview(Client, env = process.env, request = fetch) {
  requirePreviewInitialization(env);
  const client = new Client({ baseUrl: previewOrigin, operatorToken: env.OPERATOR_TOKEN, fetch: previewFetch(request) });
  const initialized = await client.operator.init({ autoSeed: false });
  if (initialized.autoSeed !== false) throw new Error("Preview initialization did not confirm disabled seeding");
  const catalog = await client.index.query({ limit: 1 });
  return { target: previewOrigin, autoSeed: false, schemaVersion: catalog.schemaVersion, catalogRead: "passed" };
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.log(JSON.stringify({ purpose: "plan-only", target: previewOrigin, autoSeed: false,
        next: "Run worker-preview-init.yml on main to initialize preview without a version bump" }));
    } else if (args.length === 1 && args[0] === "--execute") {
      requirePreviewInitialization(process.env);
      const workerDirectory = fileURLToPath(new URL("../src-worker/", import.meta.url));
      const { VRCPackageClient } = await import(pathToFileURL(Bun.resolveSync("vrc-packages-api", workerDirectory)).href);
      console.log(JSON.stringify(await initializePreview(VRCPackageClient)));
    } else throw new Error("Invalid initialization arguments");
  } catch {
    // SDK, transport and schema errors can contain remote data. Do not print them.
    console.error("Preview initialization failed. Check the workflow scope, secret and preview runtime privately.");
    process.exitCode = 1;
  }
}
