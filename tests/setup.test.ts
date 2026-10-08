import { expect, test } from "bun:test";
import { setup, setupProjects, parseEnvFile, writeEnvEntry, validateGitHubToken, interactiveSetup } from "../scripts/setup.mjs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("setupProjects includes root and all product directories", () => {
  expect(setupProjects.root).toBe(".");
  expect(setupProjects.crawler).toBe("src-crawler");
  expect(setupProjects["crawler-client"]).toBe("src-crawler-client");
  expect(setupProjects.package).toBe("src-package");
  expect(setupProjects.web).toBe("src-web");
  expect(setupProjects.worker).toBe("src-worker");
  expect(setupProjects.network).toBe("src-worker/packages/network");
  expect(setupProjects["web-search"]).toBe("src-web-search");
});

test("setup executes bun install --no-save --ignore-scripts across selected targets", async () => {
  const executed: { cmd: string; args: string[]; cwd: string }[] = [];
  const fakeExec = (cmd: string, args: string[], options: any) => {
    executed.push({ cmd, args, cwd: options.cwd });
    return "";
  };

  // Test setup("root")
  await setup("root", { exec: fakeExec as any, quiet: true });
  expect(executed.length).toBe(1);
  expect(executed[0].cmd).toBe("bun");
  expect(executed[0].args).toEqual(["install", "--no-save", "--ignore-scripts"]);

  // Test setup("all")
  executed.length = 0;
  await setup("all", { exec: fakeExec as any, quiet: true });
  // Should have executed for all 8 projects
  expect(executed.length).toBe(8);
  expect(executed.every(e => e.cmd === "bun")).toBe(true);
  expect(executed.every(e => e.args.join(" ") === "install --no-save --ignore-scripts")).toBe(true);
});

test("setup initializes submodule if package.json is missing for web-search", async () => {
  const executed: { cmd: string; args: string[]; cwd: string }[] = [];
  const fakeExec = (cmd: string, args: string[], options: any) => {
    executed.push({ cmd, args, cwd: options.cwd });
    return "";
  };

  // Run in a simulated workspace directory where src-web-search has no package.json
  const tempWorkspace = import.meta.dir;
  await setup("web-search", { workspace: tempWorkspace, exec: fakeExec as any, quiet: true });
  // Should attempt git submodule update
  const gitCall = executed.find(e => e.cmd === "git");
  expect(gitCall).toBeDefined();
  expect(gitCall?.args).toEqual(["submodule", "update", "--init", "--recursive"]);
});

test("setup throws on unknown product target", async () => {
  await expect(setup("invalid-target" as any, { quiet: true })).rejects.toThrow("Unknown project: \"invalid-target\"");
});

test("parseEnvFile and writeEnvEntry correctly read and mutate .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-setup-env-"));
  try {
    const envFile = join(dir, ".env");
    writeFileSync(envFile, "FOO=bar\n# comment\nBAZ=\"qux\"\n");
    const parsed = parseEnvFile(readFileSync(envFile, "utf8"));
    expect(parsed.FOO).toBe("bar");
    expect(parsed.BAZ).toBe("qux");

    writeEnvEntry(envFile, "NEW_KEY", "new_value");
    const updated = parseEnvFile(readFileSync(envFile, "utf8"));
    expect(updated.NEW_KEY).toBe("new_value");
    expect(updated.FOO).toBe("bar");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateGitHubToken tests token against GitHub user API", async () => {
  const fetchValid = async () => new Response(JSON.stringify({ login: "validUser" }), { status: 200 });
  const validRes = await validateGitHubToken("ghp_good", fetchValid as any);
  expect(validRes.valid).toBe(true);
  expect(validRes.login).toBe("validUser");

  const fetchInvalid = async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
  const invalidRes = await validateGitHubToken("ghp_bad", fetchInvalid as any);
  expect(invalidRes.valid).toBe(false);
  expect(invalidRes.error).toBe("HTTP 401");
});

test("interactiveSetup prompts for missing configuration and runs target setup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-interactive-setup-"));
  try {
    const executed: string[] = [];
    const fakeExec = (cmd: string, args: string[]) => {
      executed.push(`${cmd} ${args.join(" ")}`);
      return "";
    };

    const answers: Record<string, string> = {
      "GitHub Token": "ghp_mock_token",
      "CLOUDFLARE_API_TOKEN": "cf_fake_token",
      "DISCORD_STAGING_WEBHOOK": "https://discord.com/api/webhooks/mock",
      "Select target project": "root"
    };

    const askFn = async (query: string) => {
      for (const [key, val] of Object.entries(answers)) {
        if (query.includes(key)) return val;
      }
      return "";
    };

    const fetchMock = async (url: string) => {
      if (url.includes("/user")) return new Response(JSON.stringify({ login: "onboardingDev" }), { status: 200 });
      return new Response(null, { status: 404 });
    };

    writeFileSync(join(dir, "package.json"), "{}");

    const messages: string[] = [];
    const res = await interactiveSetup({
      workspace: dir,
      env: {},
      askFn,
      onProgress: (msg: string) => messages.push(msg),
      fetchFn: fetchMock as any,
      exec: fakeExec as any
    });

    expect(res.status).toBe("setup-complete");
    expect(res.target).toBe("root");
    expect(res.ghTokenConfigured).toBe(true);

    const envContent = readFileSync(join(dir, ".env"), "utf8");
    expect(envContent).toContain("GITHUB_TOKEN=ghp_mock_token");
    expect(envContent).toContain("CLOUDFLARE_API_TOKEN=cf_fake_token");
    expect(envContent).toContain("DISCORD_STAGING_WEBHOOK=https://discord.com/api/webhooks/mock");
    expect(executed).toContain("bun install --no-save --ignore-scripts");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("interactiveSetup skips prompts when tokens already configured in .env", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-interactive-setup-existing-"));
  try {
    const executed: string[] = [];
    const fakeExec = (cmd: string, args: string[]) => {
      executed.push(`${cmd} ${args.join(" ")}`);
      return "";
    };

    writeFileSync(join(dir, ".env"), "GITHUB_TOKEN=ghp_existing_token\nCLOUDFLARE_API_TOKEN=cf_existing\nDISCORD_STAGING_WEBHOOK=disc_existing\n");
    writeFileSync(join(dir, "package.json"), "{}");

    const askedQueries: string[] = [];
    const askFn = async (query: string) => {
      askedQueries.push(query);
      if (query.includes("Select target project")) return "root";
      return "";
    };

    const fetchMock = async (url: string) => {
      if (url.includes("/user")) return new Response(JSON.stringify({ login: "existingDev" }), { status: 200 });
      return new Response(null, { status: 404 });
    };

    const res = await interactiveSetup({
      workspace: dir,
      env: {},
      askFn,
      onProgress: () => {},
      fetchFn: fetchMock as any,
      exec: fakeExec as any
    });

    expect(res.status).toBe("setup-complete");
    expect(res.target).toBe("root");
    expect(res.ghTokenConfigured).toBe(true);
    expect(askedQueries.some(q => q.includes("Enter your GitHub Token"))).toBe(false);
    expect(askedQueries.some(q => q.includes("Enter CLOUDFLARE_API_TOKEN"))).toBe(false);
    expect(askedQueries.some(q => q.includes("Enter DISCORD_STAGING_WEBHOOK"))).toBe(false);
    expect(askedQueries.some(q => q.includes("Select target project"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

