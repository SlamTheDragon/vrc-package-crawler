import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import semver from "semver";
import { checkRemoteTag, checkSourceRun, sameSourceRunLink } from "./release-assets.mjs";
import { downloadActionsArchive } from "./worker-artifacts.mjs";
import { checkRecoveryRun, recoveryIdentity } from "./delivery-recovery.mjs";

const products = {
  package: { prefix: "vrcp-api", title: "VRC Packages API" },
  crawler: { prefix: "vrcp-crawler", title: "VRCP Crawler" },
  "crawler-client": { prefix: "vrcp-crawler-client", title: "VRCP Crawler Client" },
  worker: { prefix: "cloudflare-worker", title: "VRCP Worker" },
  network: { prefix: "vrcp-network", title: "VRCP Network" }
};
const sourcePaths = ["vrc-packages-api", "node-docker", "node-client", "release-assets"].map(name => `.github/workflows/${name}.yml`);

/** Receipt data is never executed. Check its size and exact shape before use. */
export function readAnnouncementReceipt(bytes, artifact) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 256 * 1024 || !bytes.length ||
    artifact.digest !== `sha256:${createHash("sha256").update(bytes).digest("hex")}`) throw new Error("Announcement archive differs");
  let entries = 0;
  const files = unzipSync(bytes, {
    filter(entry) {
      if (entry.name !== "vrcp-release-announcement.json" || entry.originalSize > 8192 || ++entries > 1) {
        throw new Error("Unexpected announcement archive entry");
      }
      return true;
    }
  });
  if (entries !== 1) throw new Error("Announcement receipt missing");
  const receipt = JSON.parse(new TextDecoder().decode(files["vrcp-release-announcement.json"]));
  const keys = ["schemaVersion", "product", "channel", "tag", "sourceRun", "commit", "releaseId", "draft"];
  if (!receipt || Object.keys(receipt).length !== keys.length || keys.some(key => !Object.hasOwn(receipt, key)) ||
    receipt.schemaVersion !== 1 || !Object.hasOwn(products, receipt.product) ||
    !["release", "preview"].includes(receipt.channel) || typeof receipt.tag !== "string" || receipt.tag.length > 160 ||
    !Number.isSafeInteger(receipt.sourceRun) || receipt.sourceRun < 1 || typeof receipt.commit !== "string" || !/^[a-f0-9]{40}$/.test(receipt.commit) ||
    !Number.isSafeInteger(receipt.releaseId) || receipt.releaseId < 1 || typeof receipt.draft !== "boolean") {
    throw new Error("Invalid announcement receipt");
  }
  const prefix = `${products[receipt.product].prefix}/v`;
  const version = receipt.tag.slice(prefix.length);
  if (!receipt.tag.startsWith(prefix) || semver.valid(version) !== version ||
    (semver.prerelease(version) === null) !== (receipt.channel === "release")) throw new Error("Announcement channel differs");
  return receipt;
}

export function releaseEmbed(release, receipt, repository) {
  const url = `https://github.com/${repository}/releases/tag/${receipt.tag}`;
  const suffix = "\n\nFull notes are on the release page.";
  const body = release.body.trim();
  const description = body.length > 3900 ? body.slice(0, 3900 - suffix.length) + suffix : body;
  return {
    allowed_mentions: { parse: [] }, embeds: [{
      title: `${products[receipt.product].title} ${receipt.tag.split("/v")[1]}`.slice(0, 256),
      url, description, color: receipt.channel === "preview" ? 0x5865f2 : 0x2ecc71,
      fields: [{ name: "Build", value: `[Successful CI run](https://github.com/${repository}/actions/runs/${receipt.sourceRun})`, inline: true },
      { name: "Assets", value: release.assets.map(asset => asset.name).join("\n").slice(0, 1024), inline: true }],
      footer: { text: `${receipt.channel === "preview" ? "Preview" : "Release"} verified · ${receipt.commit.slice(0, 12)}` }
    }], components: [{ type: 1, components: [{ type: 2, style: 5, label: "View release", url }] }]
  };
}

export function stagingEmbed(options) {
  const { version, runId, repository = "SlamTheDragon/vrc-packages", ping, product = "package", statusText } = options;
  const prod = products[product] || { prefix: product, title: product };
  const tag = `${prod.prefix}/v${version}`;
  const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  const releaseUrl = `https://github.com/${repository}/releases/tag/${tag}`;

  const isNpm = product === "package";
  const npmUrl = "https://www.npmjs.com/package/vrc-packages-api";
  const targetUrl = isNpm ? npmUrl : runUrl;
  const description = isNpm
    ? `Package **vrc-packages-api@${version}** has been staged on npm and is awaiting manual owner approval.`
    : `Release delivery for **${prod.title} v${version}** is pending approval in GitHub Actions.`;

  const fields = [
    { name: "Product", value: `\`${prod.title}\``, inline: true },
    { name: "Version", value: `\`${version}\``, inline: true },
    { name: "CI Run", value: `[View Actions Run](${runUrl})`, inline: true }
  ];

  if (isNpm) {
    fields.push(
      { name: "Approval Required", value: `Review and approve staged package at [npmjs.com](${npmUrl})`, inline: false },
      { name: "Draft Release", value: `[${tag}](${releaseUrl})`, inline: false }
    );
  } else {
    fields.push(
      { name: "Approval Required", value: `Review and approve deployment / publication at [Actions Run](${runUrl})`, inline: false },
      { name: "Release Page", value: `[${tag}](${releaseUrl})`, inline: false }
    );
  }

  const payload = {
    allowed_mentions: { parse: ["roles", "users", "everyone"] },
    embeds: [{
      title: `📦 ${prod.title} ${version} — Publication Approval Pending`,
      url: targetUrl,
      description,
      color: 0xf1c40f,
      fields,
      footer: { text: "VRCP Staging Notification · Approval required to finalize release" }
    }],
    components: [{
      type: 1,
      components: [
        ...(isNpm ? [{ type: 2, style: 5, label: "Approve on npm", url: npmUrl }] : []),
        { type: 2, style: 5, label: "View Actions Run", url: runUrl },
        { type: 2, style: 5, label: "Release Page", url: releaseUrl }
      ]
    }]
  };

  if (ping && typeof ping === "string" && ping.trim().length > 0) {
    payload.content = ping.trim();
  }

  return payload;
}

export async function sendDiscordStagingNotification(options, request = fetch) {
  const { webhook, version, runId, repository, ping, product = "package", statusText } = options;
  if (!webhook || typeof webhook !== "string" || !webhook.trim()) {
    return { status: "skipped", reason: "no-webhook" };
  }
  const payload = stagingEmbed({ version, runId, repository, ping, product, statusText });
  const messageId = await sendDiscordRelease(webhook, payload, request);
  return { status: "sent", messageId };
}

function webhookURL(webhook) {
  let url;
  try { url = new URL(webhook); } catch { throw new Error("Discord release secret is missing or invalid"); }
  if (url.origin !== "https://discord.com" || url.username || url.password || url.search || url.hash ||
    !/^\/api\/webhooks\/[1-9]\d*\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error("Invalid Discord webhook destination");
  url.searchParams.set("wait", "true");
  url.searchParams.set("with_components", "true");
  return url;
}

/** Do not retry an ambiguous POST: a lost acknowledgement can follow a sent message. */
export async function sendDiscordRelease(webhook, payload, request = fetch) {
  const url = webhookURL(webhook);
  let reader;
  try {
    const response = await request(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Webhook rejected"); }
    if (!response.body) throw new Error("Missing webhook receipt");
    reader = response.body.getReader();
    const parts = [];
    let size = 0;
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) throw new Error("Oversized webhook receipt");
      parts.push(value);
    }
    const message = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!/^[1-9]\d*$/.test(message.id ?? "")) throw new Error("Missing webhook message receipt");
    return message.id;
  } catch { throw new Error("Discord delivery failed or is uncertain; no automatic resend"); }
  finally { try { await reader?.cancel(); } catch { /* Never log webhook transport details. */ } }
}

export async function announceRelease(event, repository, api, download, send) {
  const notified = event.workflow_run;
  if (!notified || notified.status !== "completed" || notified.conclusion !== "success" ||
    notified.head_repository?.full_name !== repository || !sourcePaths.includes(notified.path) ||
    !Number.isSafeInteger(notified.id)) throw new Error("Announcement requires a successful trusted workflow");
  const listing = await api("GET", `/repos/${repository}/actions/runs/${notified.id}/artifacts?per_page=100`);
  if (!Array.isArray(listing.artifacts) || listing.total_count !== listing.artifacts.length || listing.total_count >= 100) {
    throw new Error("Incomplete announcement artifact listing");
  }
  const matching = listing.artifacts.filter(artifact => artifact.name === "ci-only-release-announcement");
  if (matching.length !== 1 || matching[0].expired || matching[0].size_in_bytes > 256 * 1024) throw new Error("Announcement artifact missing or invalid");
  const receipt = readAnnouncementReceipt(await download(matching[0]), matching[0]);
  if (receipt.draft) return { status: "draft-skipped" };
  const source = await api("GET", `/repos/${repository}/actions/runs/${receipt.sourceRun}`);
  const recovery = source.event === "workflow_dispatch"
    ? await checkRecoveryRun(source, recoveryIdentity(receipt.tag), path => api("GET", path)) : null;
  if (source.status !== "completed" || source.conclusion !== "success" || (recovery?.commit ?? source.head_sha) !== receipt.commit ||
    (notified.path !== ".github/workflows/release-assets.yml" && notified.id !== receipt.sourceRun)) throw new Error("Original release workflow is not green");
  const jobs = await api("GET", `/repos/${repository}/actions/runs/${receipt.sourceRun}/jobs?per_page=100`);
  if (!Array.isArray(jobs.jobs) || jobs.total_count !== jobs.jobs.length || jobs.total_count >= 100) throw new Error("Incomplete release jobs");
  checkSourceRun(source, jobs.jobs, receipt.tag, repository, receipt.product);
  if (receipt.product === "crawler" && !jobs.jobs.some(job => job.name === "publish-container" && job.conclusion === "success")) {
    throw new Error("Crawler registry publication did not pass");
  }
  await checkRemoteTag(api, repository, receipt.tag, receipt.commit);
  const release = await api("GET", `/repos/${repository}/releases/${receipt.releaseId}`);
  if (release.id !== receipt.releaseId || release.tag_name !== receipt.tag || release.draft !== false || release.prerelease !== (receipt.channel === "preview") ||
    release.html_url !== `https://github.com/${repository}/releases/tag/${receipt.tag}` || typeof release.body !== "string" ||
    release.body.length > 16_384 || !release.body.includes(`Commit: ${receipt.commit}.\n`) ||
    !sameSourceRunLink(release.body, `https://github.com/${repository}/actions/runs/${receipt.sourceRun}`, repository) ||
    !Array.isArray(release.assets) || !release.assets.length || release.assets.length > 20 ||
    release.assets.some(asset => asset.state !== "uploaded" || !/^[a-f0-9]{64}$/.test(asset.digest?.slice(7) ?? "") ||
      !asset.digest.startsWith("sha256:") || typeof asset.name !== "string" || asset.name.length > 200) ||
    !["CHANGELOG.md", "CHECKSUMS.sha256"].every(name => release.assets.some(asset => asset.name === name)) ||
    (receipt.product === "package" && !release.body.includes("Current delivery status: npm publication checked."))) {
    throw new Error("Public release does not match checked delivery");
  }
  const name = `VRCP Discord release: ${receipt.tag}`;
  const checks = await api("GET", `/repos/${repository}/commits/${receipt.commit}/check-runs?check_name=${encodeURIComponent(name)}&filter=all&per_page=100`);
  if (!Array.isArray(checks.check_runs) || checks.total_count !== checks.check_runs.length || checks.total_count >= 100) throw new Error("Incomplete announcement checks");
  if (checks.check_runs.length) {
    const previous = checks.check_runs[0];
    if (checks.check_runs.length === 1 && previous.name === name && previous.head_sha === receipt.commit &&
      previous.conclusion === "success" && /^discord:[1-9]\d*$/.test(previous.external_id ?? "")) {
      return { status: "already-announced", tag: receipt.tag };
    }
    throw new Error("Prior announcement is unresolved; inspect before retrying");
  }
  const check = await api("POST", `/repos/${repository}/check-runs`, {
    name, head_sha: receipt.commit, status: "in_progress",
    details_url: release.html_url, external_id: `release:${receipt.releaseId}`
  });
  if (!Number.isSafeInteger(check.id) || check.id < 1) throw new Error("Invalid announcement check");
  const messageId = await send(releaseEmbed(release, receipt, repository), receipt.channel);
  await api("PATCH", `/repos/${repository}/check-runs/${check.id}`, {
    status: "completed", conclusion: "success",
    external_id: `discord:${messageId}`, output: { title: "Release announcement delivered", summary: `[View release](${release.html_url})` }
  });
  return { status: "announced", tag: receipt.tag, release: release.html_url };
}

async function main() {
  const env = process.env;
  if (process.argv[2] === "staging-notify") {
    const versionIdx = process.argv.indexOf("--version");
    const version = versionIdx !== -1 ? process.argv[versionIdx + 1] : undefined;
    const productIdx = process.argv.indexOf("--product");
    const product = productIdx !== -1 ? process.argv[productIdx + 1] : "package";
    if (!version) throw new Error("Expected --version <version> for staging-notify");
    const webhook = env.DISCORD_STAGING_WEBHOOK;
    const ping = env.DISCORD_STAGING_PING;
    const runId = Number(env.GITHUB_RUN_ID) || 0;
    const repository = env.GITHUB_REPOSITORY || "SlamTheDragon/vrc-packages";
    const result = await sendDiscordStagingNotification({ webhook, version, runId, repository, ping, product });
    console.log(JSON.stringify(result));
    return;
  }
  if (env.GITHUB_ACTIONS !== "true" || !["workflow_run", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
    env.GITHUB_REPOSITORY !== "SlamTheDragon/vrc-packages" || !env.GITHUB_TOKEN) throw new Error("Announcement is CI-only");
  const rawEvent = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const webhooks = { release: env.DISCORD_RELEASE_WEBHOOK, preview: env.DISCORD_PREVIEW_WEBHOOK };
  for (const webhook of Object.values(webhooks)) webhookURL(webhook);
  const api = async (method, path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/vnd.github+json", "user-agent": "VRCPReleaseAnnouncement",
        authorization: `Bearer ${env.GITHUB_TOKEN}`, "content-type": "application/json"
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("GitHub announcement metadata request failed"); }
    return response.json();
  };
  let event = rawEvent;
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    const runId = rawEvent.inputs?.["run-id"];
    if (!runId || !/^[1-9][0-9]*$/.test(String(runId))) throw new Error("Expected a numeric run-id input for workflow_dispatch announcement");
    const run = await api("GET", `/repos/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`);
    event = { workflow_run: run };
  }
  const result = await announceRelease(event, env.GITHUB_REPOSITORY, api,
    artifact => downloadActionsArchive(env.GITHUB_REPOSITORY, artifact.id, env.GITHUB_TOKEN),
    (payload, channel) => sendDiscordRelease(webhooks[channel], payload));
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Release announcement failed. Inspect its check before retrying; no automatic resend."); process.exitCode = 1; });
}
