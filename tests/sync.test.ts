import { expect, test } from "bun:test";
import { checkSync, syncInternalDependencies } from "../scripts/versioning.mjs";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("checkSync reports in-sync when branch and version configs match remote", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-sync-test-"));
  try {
    const relVersions = {
      "release-crawler": "0.0.1",
      "release-crawler-client": "0.0.1",
      "release-package": "0.0.1",
      "release-web": "0.0.1",
      "release-worker": "0.0.1"
    };
    const prevVersions = {
      "preview-crawler": "2026.10.1-pre",
      "preview-crawler-client": "26.10.1-pre",
      "preview-package": "2026.10.1-pre",
      "preview-web": "0.0.1",
      "preview-worker": "2026.10.1-pre",
      "preview-network": "2026.10.1"
    };
    writeFileSync(join(dir, "config.versions.json"), JSON.stringify(relVersions, null, 2));
    writeFileSync(join(dir, "config.preview.versions.json"), JSON.stringify(prevVersions, null, 2));

    const mockGit = (...args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("symbolic-ref")) return "main";
      if (cmd.startsWith("rev-list --left-right")) return "0\t0";
      if (cmd === "show origin/main:config.versions.json") return JSON.stringify(relVersions);
      if (cmd === "show origin/main:config.preview.versions.json") return JSON.stringify(prevVersions);
      return "";
    };

    const res = await checkSync({ workspace: dir, git: mockGit as any });
    expect(res.status).toBe("in-sync");
    expect(res.branch).toBe("main");
    expect(res.git.ahead).toBe(0);
    expect(res.git.behind).toBe(0);
    expect(res.versions.release.inSync).toBe(true);
    expect(res.versions.preview.inSync).toBe(true);
    expect(res.drifts.length).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkSync detects git branch behind and version config drift", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-sync-drift-"));
  try {
    const relVersions = {
      "release-crawler": "0.0.1",
      "release-crawler-client": "0.0.1",
      "release-package": "0.0.1",
      "release-web": "0.0.1",
      "release-worker": "0.0.1"
    };
    const prevVersions = {
      "preview-crawler": "2026.10.1-pre",
      "preview-crawler-client": "26.10.1-pre",
      "preview-package": "2026.10.1-pre",
      "preview-web": "0.0.1",
      "preview-worker": "2026.10.1-pre",
      "preview-network": "2026.10.1"
    };
    writeFileSync(join(dir, "config.versions.json"), JSON.stringify(relVersions, null, 2));
    writeFileSync(join(dir, "config.preview.versions.json"), JSON.stringify(prevVersions, null, 2));

    // Remote is ahead on release-crawler (0.0.2)
    const remoteRel = { ...relVersions, "release-crawler": "0.0.2" };

    const mockGit = (...args: string[]) => {
      const cmd = args.join(" ");
      if (cmd.startsWith("symbolic-ref")) return "main";
      if (cmd.startsWith("rev-list --left-right")) return "1\t3"; // 1 ahead, 3 behind
      if (cmd === "show origin/main:config.versions.json") return JSON.stringify(remoteRel);
      if (cmd === "show origin/main:config.preview.versions.json") return JSON.stringify(prevVersions);
      return "";
    };

    const res = await checkSync({ workspace: dir, git: mockGit as any });
    expect(res.status).toBe("drift-detected");
    expect(res.git.ahead).toBe(1);
    expect(res.git.behind).toBe(3);
    expect(res.drifts.some(d => d.includes("behind origin/main by 3 commit"))).toBe(true);
    expect(res.drifts.some(d => d.includes("release-crawler: local (0.0.1) is behind origin/main (0.0.2)"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("syncInternalDependencies updates network package url in crawler and worker manifests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-sync-deps-"));
  try {
    const prevVersions = {
      "preview-crawler": "2026.10.1-pre",
      "preview-crawler-client": "26.10.1-pre",
      "preview-package": "2026.10.1-pre",
      "preview-web": "0.0.1",
      "preview-worker": "2026.10.1-pre",
      "preview-network": "2026.10.9"
    };
    writeFileSync(join(dir, "config.preview.versions.json"), JSON.stringify(prevVersions, null, 2));

    // Set up src-crawler
    const crawlerDir = join(dir, "src-crawler");
    mkdirSync(crawlerDir, { recursive: true });
    writeFileSync(join(crawlerDir, "package.json"), JSON.stringify({
      name: "vrc-packages-crawler",
      dependencies: {
        "vrc-packages-network": "https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v2026.10.1/vrc-packages-network-2026.10.1.tgz"
      }
    }, null, 2));

    // Set up src-worker
    const workerDir = join(dir, "src-worker");
    mkdirSync(workerDir, { recursive: true });
    writeFileSync(join(workerDir, "package.json"), JSON.stringify({
      name: "vrc-packages-worker",
      dependencies: {
        "vrc-packages-network": "https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v2026.10.1/vrc-packages-network-2026.10.1.tgz"
      }
    }, null, 2));

    const res = await syncInternalDependencies(dir);
    expect(res.status).toBe("internal-deps-synced");
    expect(res.networkVersion).toBe("2026.10.9");
    expect(res.updated.length).toBe(2);

    const updatedCrawler = JSON.parse(readFileSync(join(crawlerDir, "package.json"), "utf8"));
    expect(updatedCrawler.dependencies["vrc-packages-network"]).toBe(
      "https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v2026.10.9/vrc-packages-network-2026.10.9.tgz"
    );

    const updatedWorker = JSON.parse(readFileSync(join(workerDir, "package.json"), "utf8"));
    expect(updatedWorker.dependencies["vrc-packages-network"]).toBe(
      "https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v2026.10.9/vrc-packages-network-2026.10.9.tgz"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
