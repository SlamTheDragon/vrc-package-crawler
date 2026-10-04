import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

describe("Pre-production directory layout and configuration conformance", () => {
  const rootDir = join(import.meta.dir, "..");

  test("project names distinguish the VRC Packages brand from VRCP components", () => {
    const names = [
      ["package.json", "vrc-packages"],
      ["src-crawler/package.json", "vrcp-crawler-node"],
      ["src-worker/package.json", "vrcp-worker"],
      ["src-web/package.json", "vrcp-web"],
      ["src-crawler-client/package.json", "vrcp-crawler-client"],
      ["src-package/package.json", "vrc-packages-api"],
      ["src-worker/packages/network/package.json", "vrc-packages-network"]
    ];
    for (const [path, name] of names) {
      const manifest = JSON.parse(readFileSync(join(rootDir, path), "utf8"));
      expect(manifest.name).toBe(name);
      expect(manifest.description ?? "").not.toContain("VRChat Package Crawler");
    }
    expect(readFileSync(join(rootDir, "README.md"), "utf8").split(/\r?\n/)[0]).toBe("# VRC Packages");
    const docker = readFileSync(join(rootDir, "src-crawler/Dockerfile"), "utf8");
    expect(docker).toContain("USER vrcpuser");
    expect(docker).not.toMatch(/\bvrc(?:user|group)\b/);
    expect(docker).not.toContain("COPY src-package");
    expect(readFileSync(join(rootDir, "src-crawler/.dockerignore"), "utf8")).toContain("!src/**");
  });

  test("runtime consumers declare exact artifacts instead of sibling SDK links", () => {
    const release = JSON.parse(readFileSync(join(rootDir, "config.versions.json"), "utf8"));
    const network = JSON.parse(readFileSync(join(rootDir, "src-worker/packages/network/package.json"), "utf8"));
    for (const project of ["src-worker", "src-crawler", "src-web", "src-crawler-client"]) {
      const manifest = JSON.parse(readFileSync(join(rootDir, project, "package.json"), "utf8"));
      expect(manifest.dependencies["vrc-packages-api"]).toBe(release["release-package"]);
      expect(Object.values(manifest.dependencies).some(value => String(value).startsWith("file:"))).toBe(false);
      if (project === "src-worker" || project === "src-crawler") {
        expect(manifest.dependencies["vrc-packages-network"]).toBe(network.version);
      }
    }
    expect(network.dependencies["vrc-packages-api"]).toBe(release["release-package"]);
    expect(network.private).toBe(true);
    for (const entry of Object.values(network.exports) as { types: string; import: string }[]) {
      expect(entry.types).toMatch(/^\.\/dist\/.*\.d\.ts$/);
      expect(entry.import).toMatch(/^\.\/dist\/.*\.js$/);
    }
  });

  test("contains required directories in pre-production architecture", () => {
    const requiredDirs = [
      ".agents",
      "src-web",
      "src-worker",
      "src-crawler",
      "src-crawler-client",
      "src-package",
      "docs",
      "docs/scratch",
      "docs/research",
      "docs/source",
    ];

    for (const dir of requiredDirs) {
      expect(existsSync(join(rootDir, dir))).toBe(true);
    }
  });

  test("contains required governance and operator documents with minimal scratch footprint", () => {
    const requiredFiles = [
      "AGENTS.md",
      "DELEGATES.md",
      "LEGAL.md",
      "LICENSE.md",
      "README.md",
      "docs/scratch/IMPLEMENTATION_PLAN.md",
      "docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md",
      "docs/scratch/task_tracker.md",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(rootDir, file))).toBe(true);
    }
    expect(readdirSync(join(rootDir, "docs/scratch")).sort()).toEqual([
      "IMPLEMENTATION_PLAN.md", "UNMERGED_IMPLEMENTATION_PLAN.md", "task_tracker.md"
    ]);
  });

  test("crawler and Worker scripts use their own runtime entry points, not coordinator binaries or scaffolds", () => {
    const node = JSON.parse(readFileSync(join(rootDir, "src-crawler/package.json"), "utf8"));
    const worker = JSON.parse(readFileSync(join(rootDir, "src-worker/package.json"), "utf8"));
    expect(node.scripts.node).toBe("bun run src/main.ts");
    expect(node.scripts["build:dev"]).toContain("dist/dev/vrcp-crawler-node.exe src/main.ts");
    expect(node.scripts["build:node:linux"]).toContain("vrcp-crawler-node-linux src/main.ts");
    expect(Object.keys(node.scripts).some(key => key.includes("coordinator"))).toBe(false);
    expect(worker.scripts.build).toBe("npm run build:preview");
    expect(worker.scripts["build:preview"]).toContain("wrangler deploy --dry-run");
    expect(worker.scripts["build:preview"]).toContain("--env preview");
    expect(worker.scripts.test).toBe("bun test ./test");
    expect(worker.scripts["test:workers"]).toBe("vitest run");
    expect(worker.scripts["test:runtime"]).toBe("node test/coordinator_runtime_smoke.mjs");
    expect(existsSync(join(rootDir, "src-worker/src/index.ts"))).toBe(false);
  });

  test("worker, node, and package SDK implementation entry points exist", () => {
    expect(existsSync(join(rootDir, "src-worker", "src", "worker_entry.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-web", "src", "worker", "worker_entry.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler", "src", "worker", "worker_entry.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler", "src", "main.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler", "src", "worker", "main.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-package", "src", "index.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-web/src/pages/index.astro"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler-client/src/routes/+page.svelte"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler-client/src-tauri/tauri.conf.json"))).toBe(true);
  });

  test("runtime implementation and integration tests have separate owners without old forwarding files", () => {
    expect(existsSync(join(rootDir, "src-crawler/src/node/main.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler/src/node/index.ts"))).toBe(false);
    for (const path of ["client/node_client.ts", "runner/daemon.ts", "storage/local_sqlite.ts",
      "adapters/observation_adapter.ts", "config/runtime_config.ts"]) {
      expect(existsSync(join(rootDir, "src-crawler/src", path))).toBe(true);
    }
    for (const file of ["main.ts", "handler.ts", "operator_handler.ts", "index.ts", "local_sqlite.ts",
      "runtime_config.ts", "robots_refresh_service.ts"]) {
      expect(existsSync(join(rootDir, "src-worker/src", file))).toBe(false);
    }
    expect(existsSync(join(rootDir, "src-web/src/worker/storage/local_sqlite.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-worker/test/support/local_sqlite.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-worker/test/d1_coordinator_store.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-worker/test/integration/node_daemon.test.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-worker/test/integration/node_lease_runner.test.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler/tests/node_daemon.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler/tests/node_lease_runner.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-crawler/tests/shopify_sitemap_discovery.test.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-worker/src/storage/d1/coordinator.ts"))).toBe(true);
    expect(existsSync(join(rootDir, "src-web/tests/worker/d1_coordinator_store.test.ts"))).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler/tests/d1_coordinator_store.test.ts"))).toBe(false);
    expect(readFileSync(join(rootDir, "src-crawler/src/index.ts"), "utf8")).not.toContain("worker/");
  });

  test("src-worker config serves only the API with local D1 and a consistent preview binding", () => {
    const config = Bun.TOML.parse(readFileSync(join(rootDir, "src-worker", "wrangler.toml"), "utf8"));
    expect(config.main).toBe("src/worker_entry.ts");
    expect(config.assets).toBeUndefined();
    expect(config.compatibility_flags).toContain("nodejs_compat");
    const databases = config.d1_databases as { binding: string; database_id: string; remote?: boolean }[];
    expect(databases).toHaveLength(1);
    expect(databases[0].binding).toBe("VRCP_D1");
    expect(databases[0].database_id).toBe("722bdd0d-92ca-445b-9319-da0b27adf7b2");
    expect(databases[0].remote).toBe(false);
    const previews = (config.env as { preview: { d1_databases: typeof databases } }).preview.d1_databases;
    expect(previews).toHaveLength(1);
    expect(previews[0].binding).toBe(databases[0].binding);
    expect(previews[0].database_id).not.toBe(databases[0].database_id);
    expect(previews[0].remote).toBe(false);
    expect(config.previews).toBeUndefined();
    expect(config.preview_urls).toBe(false);
    expect(existsSync(join(rootDir, "src-crawler", "wrangler.toml"))).toBe(false);
  });
});
