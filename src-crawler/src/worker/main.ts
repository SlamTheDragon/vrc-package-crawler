import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LocalCoordinatorStore } from "./storage/local_sqlite.ts";
import { handleNodeRequest } from "./api/handler.ts";
import { handleOperatorRequest } from "./api/operator_handler.ts";
import { handlePublicCatalogRequest } from "./api/public_handler.ts";
import { handleDownstreamRequest } from "./api/downstream_handler.ts";
import { handleRegistrantRequest } from "./api/registrant_handler.ts";
import { PlatformSchema, type Platform } from "../shared/protocol/node_protocol.ts";
import { LeadStatusSchema, decodeLeadCursor, decodeCatalogCursor } from "../shared/protocol/operator_protocol.ts";
import { CreateSourceAccessProfileSchema, SourcePurposeSchema,
  decodeProfileCursor } from "../shared/policy/source_access_profile.ts";
import { fetchPublicMetadata } from "../node/client/public_metadata_fetch.ts";
import { refreshDueRobots, refreshRobotsWithLease, ROBOTS_REFRESH_POLL_MS } from
  "./services/robots_refresh_service.ts";
import { initializeCoordinatorConfig, loadCoordinatorRuntimeConfig } from
  "./config/runtime_config.ts";

function printUsage(): void {
  console.log("Usage: vrc-coordinator init [listen-port] | serve [port] | register <node-id> [platforms] | revoke <node-id> | seed <platform> <https-url> [min-delay-ms] [metadata|discovery] | profile-create <json> | profile-disable <profile-id> <reason> | profiles [limit] [cursor] | refresh-robots <https-origin> | refresh-queued-robots [limit] | leads [status] [limit] [cursor] | approve-lead <lead-key> [min-delay-ms] | suppress <https-url> <reason> | inspect | node-evidence <node-id> | issues | vpm-evidence | catalog [limit] [cursor]");
}

const [command = "help", ...args] = Bun.argv.slice(2);
if (command === "help" || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

if (command === "init") {
  const listenPort = args[0] === undefined ? 8787 : Number(args[0]);
  if (args.length > 1 || !Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
    console.error("Usage: vrc-coordinator init [listen-port]");
    process.exit(2);
  }
  try {
    const path = initializeCoordinatorConfig(process.cwd(), listenPort);
    console.log(`Created non-secret coordinator config at ${path}; set COORDINATOR_OPERATOR_TOKEN separately.`);
    process.exit(0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      console.log(`Coordinator config already exists at ${join(process.cwd(), "coordinator.config.json")}; skipping re-initialization.`);
      process.exit(0);
    }
    throw error;
  }
}
const { databasePath, listenPort } = loadCoordinatorRuntimeConfig(process.cwd(), process.env);
const store = new LocalCoordinatorStore(databasePath);

function usage(): never {
  printUsage();
  store.close();
  process.exit(2);
}

switch (command) {
  case "serve": {
    const port = args[0] === undefined ? listenPort : Number(args[0]);
    if (args.length > 1 || !Number.isInteger(port) || port < 1 || port > 65535) usage();
    const operatorToken = process.env.COORDINATOR_OPERATOR_TOKEN || "";
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: (request) => {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/v1/operator/")) {
          return handleOperatorRequest(request, store, operatorToken);
        }
        if (path === "/v1/catalog" || path === "/v1/catalog/delta") {
          return handlePublicCatalogRequest(request, store);
        }
        if (path.startsWith("/v1/apps/") || path === "/v1/catalog/search" || path === "/v1/catalog/random") {
          return handleDownstreamRequest(request, store);
        }
        if (path.startsWith("/v1/registrant/") || path === "/v1/delist") {
          return handleRegistrantRequest(request, store);
        }
        return handleNodeRequest(request, store);
      }
    });
    console.log(`Local coordinator listening on ${server.url}; database ${databasePath}`);
    const shutdown = new AbortController();
    let activeRefresh: Promise<void> | null = null;
    let stopping = false;
    const refresh = () => {
      if (stopping || activeRefresh) return;
      activeRefresh = refreshDueRobots(store, fetchPublicMetadata, undefined, shutdown.signal)
        .then((refreshed) => {
          for (const result of refreshed) console.log(JSON.stringify({ robotsRefresh: result }));
        })
        .catch((cause) => {
          if (!stopping) console.error(`Robots refresh failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        })
        .finally(() => { activeRefresh = null; });
    };
    const timer = setInterval(refresh, ROBOTS_REFRESH_POLL_MS);
    refresh();
    const stopFile = join(process.cwd(), "coordinator.stop");
    if (existsSync(stopFile)) {
      try { unlinkSync(stopFile); } catch {}
    }
    const stopWatcher = setInterval(() => {
      if (existsSync(stopFile)) {
        stop();
      }
    }, 100);
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      clearInterval(stopWatcher);
      if (existsSync(stopFile)) {
        try { unlinkSync(stopFile); } catch {}
      }
      clearInterval(timer);
      shutdown.abort();
      server.stop();
      await activeRefresh;
      store.close();
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (process.stdin.isTTY === false) {
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (data) => {
        const text = String(data).trim();
        if (text === "stop" || text === "exit" || text === "shutdown") {
          stop();
        }
      });
      process.stdin.unref();
    }
    break;
  }
  case "register": {
    const [nodeId, platformList] = args;
    if (!nodeId) usage();
    const capabilities = (platformList || PlatformSchema.options.join(",")).split(",") as Platform[];
    const token = store.createNodeCredential(nodeId, capabilities);
    console.log(JSON.stringify({ nodeId, capabilities, token }));
    store.close();
    break;
  }
  case "revoke": {
    if (!args[0]) usage();
    store.revokeNode(args[0]);
    console.log(`Revoked ${args[0]}`);
    store.close();
    break;
  }
  case "seed": {
    const [platform, url, delay, purpose] = args;
    if (!platform || !url || args.length > 4) usage();
    const jobPurpose = SourcePurposeSchema.parse(purpose || "metadata");
    const jobId = store.seedJob(url, PlatformSchema.parse(platform), delay ? Number(delay) : 1000,
      undefined, jobPurpose);
    console.log(JSON.stringify({ jobId, platform, url, purpose: jobPurpose }));
    store.close();
    break;
  }
  case "profile-create": {
    if (args.length !== 1) usage();
    const profile = store.createSourceAccessProfile(CreateSourceAccessProfileSchema.parse(JSON.parse(args[0])),
      "operator-cli");
    console.log(JSON.stringify({ profile }));
    store.close();
    break;
  }
  case "profile-disable": {
    if (args.length < 2) usage();
    const profile = store.disableSourceAccessProfile(args[0], "operator-cli", args.slice(1).join(" "));
    console.log(JSON.stringify({ profile }));
    store.close();
    break;
  }
  case "profiles": {
    if (args.length > 2) usage();
    const limit = args[0] ? Number(args[0]) : 100;
    const cursor = args[1] ? decodeProfileCursor(args[1]) : null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (args[1] && !cursor)) usage();
    console.log(JSON.stringify(store.listSourceAccessProfilesPage(limit, cursor), null, 2));
    store.close();
    break;
  }
  case "refresh-robots": {
    const origin = args[0];
    if (!origin || args.length !== 1) usage();
    const leaseId = store.reserveRobotsRefresh(origin);
    if (!leaseId) throw new Error(`Robots refresh is not eligible for ${origin} (source profile, due job, active lease, or origin pacing)`);
    console.log(JSON.stringify(await refreshRobotsWithLease(store, origin, leaseId, fetchPublicMetadata)));
    store.close();
    break;
  }
  case "refresh-queued-robots": {
    const limit = args.length ? Number(args[0]) : 10;
    if (args.length > 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) usage();
    const refreshed = await refreshDueRobots(store, fetchPublicMetadata, limit);
    console.log(JSON.stringify({ refreshed }));
    store.close();
    break;
  }
  case "suppress": {
    const [url, ...reason] = args;
    if (!url || reason.length === 0) usage();
    store.suppressUrl(url, reason.join(" "));
    console.log(`Suppressed ${url}`);
    store.close();
    break;
  }
  case "leads": {
    if (args.length > 3) usage();
    const status = LeadStatusSchema.safeParse(args[0] || "pending_review");
    const limit = args[1] === undefined ? 100 : Number(args[1]);
    const cursor = status.success && args[2] ? decodeLeadCursor(args[2], status.data) : null;
    if (!status.success || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        (args[2] !== undefined && !cursor)) usage();
    console.log(JSON.stringify(store.listLeadsPage(status.data, limit, cursor), null, 2));
    store.close();
    break;
  }
  case "approve-lead": {
    if (!args[0]) usage();
    const jobId = store.approveVpmListingLead(args[0], args[1] ? Number(args[1]) : 1000);
    console.log(JSON.stringify({ leadKey: args[0], jobId }));
    store.close();
    break;
  }
  case "inspect": {
    const onlineAfter = new Date(Date.now() - 90_000).toISOString();
    const nodes = store.db.prepare(`SELECT c.node_id,c.capabilities_json,
      CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked'
        WHEN h.last_seen_at>=? THEN 'online' ELSE 'offline' END AS status,
      h.last_seen_at,h.state,h.active_job_id
      FROM node_credentials c LEFT JOIN node_heartbeats h ON h.node_id=c.node_id
      ORDER BY c.node_id`).all(onlineAfter);
    const jobs = store.db.prepare("SELECT platform,state,count(*) AS count FROM crawl_jobs GROUP BY platform,state ORDER BY platform,state").all();
    const sources = store.db.prepare("SELECT count(*) AS items FROM source_items").get();
    const versions = store.db.prepare("SELECT count(*) AS versions FROM source_versions").get();
    const leads = store.db.prepare("SELECT kind,status,count(*) AS count FROM source_leads GROUP BY kind,status ORDER BY kind,status").all();
    const issues = store.db.prepare("SELECT code,count(*) AS count FROM source_issues GROUP BY code ORDER BY code").all();
    const robots = store.db.prepare("SELECT origin,status_code,fetched_at,expires_at FROM origin_robots ORDER BY origin").all();
    const robotsRefreshLeases = store.db.prepare(`SELECT origin,lease_expires_at
      FROM origin_robots_refresh_leases ORDER BY origin`).all();
    const canonical = store.db.prepare("SELECT count(*) AS packages FROM canonical_packages").get();
    const identityLinks = store.db.prepare("SELECT review_state,count(*) AS count FROM identity_links GROUP BY review_state ORDER BY review_state").all();
    console.log(JSON.stringify({ nodes, jobs, sources, versions, leads, issues, robots, robotsRefreshLeases, canonical, identityLinks }, null, 2));
    store.close();
    break;
  }
  case "issues": {
    const issues = store.db.prepare(`SELECT i.issue_id,j.url AS listing_url,i.source_item_key,i.version_key,i.code,i.observed_at
      FROM source_issues i JOIN crawl_jobs j ON j.job_id=i.job_id
      ORDER BY i.issue_id DESC LIMIT 100`).all();
    console.log(JSON.stringify(issues, null, 2));
    store.close();
    break;
  }
  case "node-evidence": {
    if (!args[0] || args.length !== 1) usage();
    console.log(JSON.stringify(store.inspectNodeEvidence(args[0]), null, 2));
    store.close();
    break;
  }
  case "vpm-evidence": {
    console.log(JSON.stringify(store.listCompleteVpmEvidence(), null, 2));
    store.close();
    break;
  }
  case "catalog": {
    if (args.length > 2) usage();
    const limit = args[0] ? Number(args[0]) : 100;
    const cursor = args[1] ? decodeCatalogCursor(args[1]) : null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (args[1] && !cursor)) usage();
    console.log(JSON.stringify(store.listCanonicalPackagesPage(limit, cursor), null, 2));
    store.close();
    break;
  }
  default: usage();
}
