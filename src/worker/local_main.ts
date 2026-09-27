import { LocalCoordinatorStore } from "./local_sqlite.ts";
import { handleNodeRequest } from "./handler.ts";
import { PlatformSchema, type Platform } from "../shared/node_protocol.ts";

const [command = "help", ...args] = Bun.argv.slice(2);
const databasePath = process.env.COORDINATOR_DB_PATH || "bin/local_coordinator.db";
const store = new LocalCoordinatorStore(databasePath);

function usage(): never {
  console.error("Usage: local-coordinator serve [port] | register <node-id> [platforms] | revoke <node-id> | seed <platform> <https-url> [min-delay-ms] | leads | approve-lead <lead-key> [min-delay-ms] | suppress <https-url> <reason> | inspect | issues | vpm-evidence");
  store.close();
  process.exit(2);
}

switch (command) {
  case "serve": {
    const port = Number(args[0] || 8787);
    if (!Number.isInteger(port) || port < 1 || port > 65535) usage();
    const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: (request) => handleNodeRequest(request, store) });
    console.log(`Local coordinator listening on ${server.url}; database ${databasePath}`);
    process.on("SIGINT", () => { server.stop(); store.close(); process.exit(0); });
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
    const [platform, url, delay] = args;
    if (!platform || !url) usage();
    const jobId = store.seedJob(url, PlatformSchema.parse(platform), delay ? Number(delay) : 1000);
    console.log(JSON.stringify({ jobId, platform, url }));
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
    const leads = store.db.prepare(`SELECT lead_key,kind,target_url,claimed_package_id,discovered_from_url,status
      FROM source_leads ORDER BY first_seen_at,lead_key LIMIT 100`).all();
    console.log(JSON.stringify(leads, null, 2));
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
    console.log(JSON.stringify({ nodes, jobs, sources, versions, leads, issues }, null, 2));
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
  case "vpm-evidence": {
    console.log(JSON.stringify(store.listCompleteVpmEvidence(), null, 2));
    store.close();
    break;
  }
  default: usage();
}
