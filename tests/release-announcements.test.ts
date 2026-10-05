import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { readAnnouncementReceipt, releaseEmbed, sendDiscordRelease, announceRelease } from "../scripts/release-announcements.mjs";

const repository = "SlamTheDragon/vrc-packages", commit = "a".repeat(40);
const digest = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const paths: Record<string, string> = { package: "vrc-packages-api", crawler: "node-docker", "crawler-client": "node-client" };

function fixture(product = "package", promotion = false) {
  const prefixes: Record<string, string> = { package: "vrcp-api", crawler: "vrcp-crawler", "crawler-client": "vrcp-crawler-client" };
  const receipt: any = { schemaVersion: 1, product, channel: "release", tag: `${prefixes[product]}/v0.0.6`,
    sourceRun: 7, commit, releaseId: 9, draft: false };
  const source: any = { id: 7, event: "push", status: "completed", conclusion: "success", head_sha: commit,
    head_branch: receipt.tag, head_repository: { full_name: repository }, path: `.github/workflows/${paths[product]}.yml` };
  const event: any = { workflow_run: promotion ? { ...source, id: 8, event: "workflow_dispatch", head_branch: "main",
    path: ".github/workflows/release-assets.yml" } : source };
  const jobs: any[] = (product === "crawler" ? ["build-linux", "standalone-windows", "publish-container"] : ["build"])
    .map(name => ({ name, status: "completed", conclusion: "success" }));
  const release: any = { id: 9, tag_name: receipt.tag, draft: false, prerelease: false,
    html_url: `https://github.com/${repository}/releases/tag/${receipt.tag}`,
    body: `# Release notes\nCommit: ${commit}.\n[Checked CI run](https://github.com/${repository}/actions/runs/7)\n\nA checked change.\nCurrent delivery status: npm publication checked.\n`,
    assets: ["CHANGELOG.md", "CHECKSUMS.sha256", "product-artifact"].map(name => ({ name, digest: `sha256:${"b".repeat(64)}`, state: "uploaded" })) };
  const checks: any[] = [], messages: any[] = [];
  let listingOverride: any;
  const archive = () => zipSync({ "vrcp-release-announcement.json": Buffer.from(JSON.stringify(receipt)) });
  const api = async (method: string, path: string, body?: any) => {
    if (method === "GET" && path.includes("/artifacts?")) {
      const bytes = archive();
      return listingOverride ?? { total_count: 1, artifacts: [{ id: 11, name: "ci-only-release-announcement",
        expired: false, size_in_bytes: bytes.length, digest: digest(bytes) }] };
    }
    if (method === "GET" && path.endsWith("/actions/runs/7")) return source;
    if (method === "GET" && path.includes("/jobs?")) return { total_count: jobs.length, jobs };
    if (method === "GET" && path.includes("/git/ref/")) return { ref: `refs/tags/${receipt.tag}`, object: { type: "commit", sha: commit } };
    if (method === "GET" && path.endsWith("/releases/9")) return release;
    if (method === "GET" && path.includes("/check-runs?")) return { total_count: checks.length, check_runs: checks };
    if (method === "POST" && path.endsWith("/check-runs")) { checks.push({ id: 99, ...body }); return checks[0]; }
    if (method === "PATCH" && path.endsWith("/check-runs/99")) { Object.assign(checks[0], body); return checks[0]; }
    throw new Error(`Unexpected fixture operation: ${method} ${path}`);
  };
  const send = async (payload: any) => { messages.push(payload); return "1234567890"; };
  return { receipt, source, event, jobs, release, checks, messages, api, archive, send,
    setListing: (value: any) => { listingOverride = value; },
    run: () => announceRelease(event, repository, api, async () => archive(), send) };
}

test("all three release products send rich notes and a release button once", async () => {
  for (const product of Object.keys(paths)) {
    const f = fixture(product);
    expect((await f.run()).status).toBe("announced");
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0].embeds[0].description).toContain("A checked change.");
    expect(f.messages[0].components[0].components[0]).toEqual({ type: 2, style: 5, label: "View release", url: f.release.html_url });
    expect(f.messages[0].allowed_mentions).toEqual({ parse: [] });
    expect(f.checks[0].external_id).toBe("discord:1234567890");
    expect((await f.run()).status).toBe("already-announced");
    expect(f.messages).toHaveLength(1);
  }
  expect((await fixture("package", true).run()).status).toBe("announced");
});

test("draft, preview, failed, foreign and wrong-source deliveries never send", async () => {
  const draft = fixture(); draft.receipt.draft = true;
  expect((await draft.run()).status).toBe("draft-or-preview-skipped");
  const preview = fixture(); preview.event.workflow_run.head_branch = "vrcp-api/v2026.10.6-pre";
  expect((await preview.run()).status).toBe("preview-skipped");
  for (const alter of [
    (f: ReturnType<typeof fixture>) => { f.source.conclusion = "failure"; },
    (f: ReturnType<typeof fixture>) => { f.source.status = "in_progress"; },
    (f: ReturnType<typeof fixture>) => { f.source.head_repository.full_name = "attacker/fork"; },
    (f: ReturnType<typeof fixture>) => { f.source.path = ".github/workflows/cloudflare-worker.yml"; },
    (f: ReturnType<typeof fixture>) => { f.source.head_sha = "c".repeat(40); },
    (f: ReturnType<typeof fixture>) => { f.release.prerelease = true; },
    (f: ReturnType<typeof fixture>) => { f.release.draft = true; },
    (f: ReturnType<typeof fixture>) => { f.release.html_url = "https://evil.invalid/release"; },
    (f: ReturnType<typeof fixture>) => { f.release.assets.pop(); f.release.assets.pop(); },
    (f: ReturnType<typeof fixture>) => { f.release.body = "Unrelated notes"; },
    (f: ReturnType<typeof fixture>) => { f.jobs[0].conclusion = "failure"; },
    (f: ReturnType<typeof fixture>) => { f.setListing({ total_count: 2, artifacts: [] }); }
  ]) {
    const f = fixture(); alter(f);
    await expect(f.run()).rejects.toThrow();
    expect(f.messages).toHaveLength(0);
    expect(f.checks).toHaveLength(0);
  }
  const crawler = fixture("crawler"); crawler.jobs[2].conclusion = "skipped";
  await expect(crawler.run()).rejects.toThrow();
  expect(crawler.messages).toHaveLength(0);
});

test("malformed, oversized and mismatched receipt archives fail closed", () => {
  const f = fixture(), bytes = f.archive();
  expect(readAnnouncementReceipt(bytes, { digest: digest(bytes) })).toEqual(f.receipt);
  expect(() => readAnnouncementReceipt(bytes, { digest: `sha256:${"0".repeat(64)}` })).toThrow();
  for (const alter of [ { ...f.receipt, extra: true }, { ...f.receipt, product: "worker" },
    { ...f.receipt, sourceRun: "7" }, { ...f.receipt, tag: "vrcp-api/v2026.10.6-pre" },
    { ...f.receipt, commit: [commit] } ]) {
    const zip = zipSync({ "vrcp-release-announcement.json": Buffer.from(JSON.stringify(alter)) });
    expect(() => readAnnouncementReceipt(zip, { digest: digest(zip) })).toThrow();
  }
  for (const files of [{ "unexpected.js": Buffer.from("no") },
    { "vrcp-release-announcement.json": Buffer.from("x".repeat(8193)) }]) {
    const zip = zipSync(files);
    expect(() => readAnnouncementReceipt(zip, { digest: digest(zip) })).toThrow();
  }
});

test("long notes fit embed limits with an explicit full-notes link", () => {
  const f = fixture(); f.release.body = "x".repeat(10_000);
  const payload = releaseEmbed(f.release, f.receipt, repository), embed = payload.embeds[0];
  expect(embed.description.length).toBeLessThanOrEqual(4096);
  expect(embed.description).toEndWith("Full notes are on the release page.");
  const text = embed.title + embed.description + embed.footer.text + embed.fields.map((x: any) => x.name + x.value).join("");
  expect(text.length).toBeLessThan(6000);
});

test("webhook transport waits, enables link buttons, caps bytes and redacts failures", async () => {
  const fixtureOnlyURL = "https://discord.com/api/webhooks/123/fixture-only-not-a-live-webhook";
  let sends = 0;
  const request: any = async (url: URL, options: any) => {
    sends++;
    expect(url.searchParams.get("wait")).toBe("true");
    expect(url.searchParams.get("with_components")).toBe("true");
    expect(options.redirect).toBe("error");
    expect(options.headers.authorization).toBeUndefined();
    return Response.json({ id: "1234" });
  };
  expect(await sendDiscordRelease(fixtureOnlyURL, {}, request)).toBe("1234");
  for (const url of [undefined, "http://discord.com/api/webhooks/123/token", "https://evil.invalid/api/webhooks/123/token", `${fixtureOnlyURL}?redirect=1`]) {
    await expect(sendDiscordRelease(url, {}, request)).rejects.toThrow();
  }
  expect(sends).toBe(1);
  for (const request of [async () => { throw new Error(fixtureOnlyURL); }, async () => new Response("blocked", { status: 429 }),
    async () => new Response("x".repeat(64 * 1024 + 1)), async () => Response.json({ error: "missing id" })]) {
    await expect(sendDiscordRelease(fixtureOnlyURL, {}, request)).rejects.toThrow("Discord delivery failed or is uncertain; no automatic resend");
  }
});

test("uncertain delivery leaves a persistent guard instead of sending twice", async () => {
  const f = fixture();
  await expect(announceRelease(f.event, repository, f.api, async () => f.archive(), async () => { throw new Error("Timeout"); })).rejects.toThrow();
  expect(f.checks[0].status).toBe("in_progress");
  await expect(f.run()).rejects.toThrow("Prior announcement is unresolved");
  expect(f.messages).toHaveLength(0);
});

test("terminal workflow keeps secrets off source tags and excludes Worker/network", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release-announcements.yml", import.meta.url), "utf8");
  expect(workflow).toContain("types: [completed]");
  expect(workflow).toContain("workflow_run.conclusion == 'success'");
  expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
  expect(workflow).toContain("DISCORD_RELEASE_WEBHOOK: ${{ secrets.DISCORD_RELEASE_WEBHOOK }}");
  expect(workflow).not.toContain("Cloudflare Worker tagged deployment");
  expect(workflow).not.toContain("https://discord.com/api/webhooks/");
  expect(workflow).toContain("checks: write");
});
