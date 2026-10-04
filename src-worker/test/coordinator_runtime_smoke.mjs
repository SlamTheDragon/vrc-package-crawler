// Offline-only workerd/D1 smoke. Requires Bun, installed src-worker dependencies and Node with TypeScript stripping.
// Run from any directory after: cd src-worker; bun run build
// Then: node src-worker/test/coordinator_runtime_smoke.mjs
// The fixture module is in memory only. Never deploy it or use remote bindings.
// Current installed Miniflare 5 alpha needs its supplied option conversion API.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { unstable_readConfig } from 'wrangler';
import {
	ClaimResponseSchema,
	HeartbeatResponseSchema,
	ResultResponseSchema
} from '../../src-crawler/src/shared/protocol/node_protocol.ts';
import { NodeCredentialResponseSchema } from 'vrc-packages-api';
import { SourceAccessProfileListResponseSchema } from '../src/domain/access/source_access_profile.ts';
import { EnqueueJobResponseSchema, RevokeNodeResponseSchema, AutoQueueRuleResponseSchema,
  AutoQueueRuleListResponseSchema } from '../../src-package/src/protocol/operator.ts';
import { VRCPackageClient } from '../../src-package/src/client.ts';
const operatorToken = randomBytes(32).toString('hex');
// Bundle the real store into memory for native binding tests. No fixture is deployed.
const storageModule = execFileSync('bun', [
	'build', '--target=browser', fileURLToPath(new URL('../src/storage/d1/coordinator.ts', import.meta.url))
], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30_000 });
const refreshFixtureModule = String.raw`
import { Coordinator } from './storage.mjs';
function check(value, message) { if (!value) throw new Error(message); }
export async function refreshFixture(env) {
  const origin = 'https://native-robots.example';
  let clock = Date.now();
  const store = new Coordinator(env.VRCP_D1, () => clock);
  await operatorAtomicityFixture(env, store, clock);
  const owner = await store.issueUserToken('native-app-owner');
  const owned = await store.registerApp({ schemaVersion: 1, appName: 'Native owned app' }, owner.userId);
  const ownedRow = await env.VRCP_D1.prepare('SELECT user_id FROM user_app_ownership WHERE app_id=?').bind(owned.appId).first();
  check(ownedRow.user_id === owner.userId, 'App owner was not persisted');
  const view = await store.listUserApps(owner.userId, 50, null);
  check(view.apps.length === 1 && view.apps[0].appId === owned.appId, 'Owned app view was incorrect');
  check(Object.keys(view.apps[0]).sort().join(',') === 'appId,appName,createdAt,permissions,revokedAt', 'App view exposed private fields');
  const otherOwner = await store.issueUserToken('native-other-owner');
  check((await store.listUserApps(otherOwner.userId, 50, null, owned.appId)).apps.length === 0, 'Cross-user app view leaked');
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_app_owner BEFORE INSERT ON user_app_ownership BEGIN SELECT RAISE(ABORT,'Owner write rejected'); END;");
  let ownershipRollback = false;
  try { await store.registerApp({ schemaVersion: 1, appName: 'Native rejected owner' }, owner.userId); } catch { ownershipRollback = true; }
  check(ownershipRollback, 'Ownership failure did not reject');
  const orphan = await env.VRCP_D1.prepare("SELECT COUNT(*) AS count FROM registered_apps WHERE app_name='Native rejected owner'").first();
  check(orphan.count === 0, 'Ownership failure left an app');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_app_owner;');
  await env.VRCP_D1.prepare('UPDATE registered_users SET revoked_at=? WHERE user_id=?').bind(new Date(clock).toISOString(), owner.userId).run();
  let revokedOwnerRejected = false;
  try { await store.registerApp({ schemaVersion: 1, appName: 'Native revoked owner' }, owner.userId); } catch { revokedOwnerRejected = true; }
  check(revokedOwnerRejected, 'Revoked owner created an app');
  check((await store.listUserApps(owner.userId, 50, null)).apps.length === 0, 'Revoked owner retained app views');
  const app = await store.registerApp({ schemaVersion: 1, appName: 'Native removal fixture' });
  const removal = { schemaVersion: 1, reportType: 'removal_request', canonicalId: 'native-removal-target', reason: 'Offline review fixture' };
  const report = await store.recordRemovalReport(app.appId, removal);
  const row = await env.VRCP_D1.prepare('SELECT app_id,review_status,payload_json FROM catalog_reports WHERE report_id=?').bind(report.reportId).first();
  check(row.app_id === app.appId && row.review_status === 'pending', 'Native removal was not pending');
  check(JSON.stringify(JSON.parse(row.payload_json)) === JSON.stringify(removal), 'Native report payload changed');
  const demand = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM downstream_demand_signals WHERE app_id=?').bind(app.appId).first();
  check(demand.count === 0, 'Removal generated scheduling demand');
  await env.VRCP_D1.prepare('UPDATE registered_apps SET revoked_at=? WHERE app_id=?').bind(new Date(clock).toISOString(), app.appId).run();
  let revokedReportRejected = false;
  try { await store.recordRemovalReport(app.appId, removal); } catch { revokedReportRejected = true; }
  check(revokedReportRejected, 'Revoked app wrote removal report');
  await store.seedJob(origin + '/index.json', 'vpm', 1000, undefined, 'metadata');
  check(await store.reserveRobotsRefresh(origin) === null, 'Unreviewed refresh authorized');
  await store.createSourceAccessProfile({ schemaVersion: 1, platform: 'vpm', origin,
    pathScope: '/', method: 'GET', purpose: 'metadata', minDelayMs: 2500,
    expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-NATIVE-FIXTURE',
    reason: 'Hermetic robots storage check', retainClasses: ['normalized_facts'], publishClasses: []
  }, 'offline-fixture');
  const leases = await Promise.all([store.reserveRobotsRefresh(origin), store.reserveRobotsRefresh(origin)]);
  check(leases.filter(Boolean).length === 1, 'Refresh race issued multiple leases');
  const first = leases.find(Boolean);
  const pacing = await env.VRCP_D1.prepare('SELECT next_allowed_at FROM origin_leases WHERE origin=?').bind(origin).first();
  check(pacing.next_allowed_at === new Date(clock + 2500).toISOString(), 'Profile pacing was not applied');
  clock += 45000;
  check(await store.completeRobotsRefresh(origin, first, 404) === false, 'Expired completion accepted');
  const second = await store.reserveRobotsRefresh(origin);
  check(second && second !== first, 'Expired ownership not replaced');
  check(await store.completeRobotsRefresh(origin, first, 404) === false, 'Replaced completion accepted');
  check(await store.releaseRobotsRefresh(origin, first) === false, 'Old release erased new ownership');
  await env.VRCP_D1.prepare('UPDATE source_access_profiles SET disabled_at=? WHERE origin=?')
    .bind(new Date(clock).toISOString(), origin).run();
  check(await store.completeRobotsRefresh(origin, second, 404) === false, 'Revoked profile completed refresh');
  check(await store.releaseRobotsRefresh(origin, second) === true, 'Held refresh could not release');
  await env.VRCP_D1.prepare('UPDATE source_access_profiles SET disabled_at=NULL WHERE origin=?').bind(origin).run();
  check(await store.reserveRobotsRefresh(origin) === null, 'Release bypassed origin pacing');
  clock += 2500;
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_refresh BEFORE UPDATE ON origin_leases WHEN NEW.origin='https://native-robots.example' BEGIN SELECT RAISE(ABORT,'offline pacing failure'); END;");
  let rejected = false;
  try { await store.reserveRobotsRefresh(origin); } catch { rejected = true; }
  check(rejected, 'Pacing failure did not reject');
  const held = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM origin_robots_refresh_leases WHERE origin=?').bind(origin).first();
  check(held.count === 0, 'Pacing failure left a refresh lease');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_refresh;');
  const third = await store.reserveRobotsRefresh(origin);
  await env.VRCP_D1.exec("CREATE TRIGGER reject_native_snapshot BEFORE INSERT ON origin_robots WHEN NEW.origin='https://native-robots.example' BEGIN SELECT RAISE(ABORT,'offline snapshot failure'); END;");
  rejected = false;
  try { await store.completeRobotsRefresh(origin, third, 404); } catch { rejected = true; }
  check(rejected, 'Snapshot failure did not reject');
  const retained = await env.VRCP_D1.prepare('SELECT lease_id FROM origin_robots_refresh_leases WHERE origin=?').bind(origin).first();
  check(retained.lease_id === third, 'Snapshot failure consumed refresh ownership');
  await env.VRCP_D1.exec('DROP TRIGGER reject_native_snapshot;');
  check(third && await store.completeRobotsRefresh(origin, third, 404), 'Native guarded completion failed');
  check(await store.completeRobotsRefresh(origin, third, 599) === false, 'Consumed completion replayed');
  const snapshot = await env.VRCP_D1.prepare('SELECT status_code FROM origin_robots WHERE origin=?').bind(origin).first();
  check(snapshot.status_code === 404, 'Rejected replay changed snapshot');
  await env.VRCP_D1.prepare("UPDATE crawl_jobs SET state='blocked' WHERE origin=?").bind(origin).run();
  return { status: 'passed', refreshRace: true, staleCompletion: true, profileRevocation: true,
    pacingRollback: true, completionRollback: true };
}
async function operatorAtomicityFixture(env, store, clock) {
  const db = env.VRCP_D1, existingNode = 'native-audit-rotation', freshNode = 'native-audit-new';
  const oldToken = await store.createNodeCredential(existingNode, ['vpm']);
  const beforeCredential = await db.prepare('SELECT * FROM node_credentials WHERE node_id=?').bind(existingNode).first();
  await db.exec("CREATE TRIGGER reject_native_credential_audit BEFORE INSERT ON node_credential_actions WHEN NEW.node_id LIKE 'native-audit-%' BEGIN SELECT RAISE(ABORT,'Offline credential audit failure'); END;");
  for (const nodeId of [freshNode, existingNode]) {
    let failed = false;
    try { await store.issueNodeCredential({ schemaVersion: 1, nodeId, capabilities: ['vpm'], reason: 'Offline audit rollback' }, 'offline-fixture'); }
    catch { failed = true; }
    check(failed, 'Credential audit failure was not propagated');
  }
  await db.exec('DROP TRIGGER reject_native_credential_audit;');
  check(await db.prepare('SELECT 1 FROM node_credentials WHERE node_id=?').bind(freshNode).first() === null,
    'Failed issuance left an undisclosed credential');
  const afterCredential = await db.prepare('SELECT * FROM node_credentials WHERE node_id=?').bind(existingNode).first();
  check(JSON.stringify(beforeCredential) === JSON.stringify(afterCredential), 'Failed rotation changed existing credentials');
  check(await store.authenticate(existingNode, oldToken) !== null, 'Failed rotation invalidated the old token');
  const retriedToken = await store.issueNodeCredential({ schemaVersion: 1, nodeId: freshNode, capabilities: ['vpm'], reason: 'Offline retry' }, 'offline-fixture');
  check(await store.authenticate(freshNode, retriedToken) !== null, 'Credential retry failed');
  const issuanceAudit = await db.prepare('SELECT COUNT(*) AS count FROM node_credential_actions WHERE node_id=?').bind(freshNode).first();
  check(issuanceAudit.count === 1, 'Issuance retry did not commit exactly one audit');

  const sourceUrl = 'https://native-approval-source.example/index.json';
  const sourceJob = await store.seedJob(sourceUrl, 'vpm', 1000, undefined, 'discovery');
  for (const existing of [false, true]) {
    const origin = existing ? 'https://native-approval-existing.example' : 'https://native-approval-new.example';
    const url = origin + '/index.json', leadKey = (existing ? 'b' : 'a').repeat(64);
    if (existing) {
      const existingJob = await store.seedJob(url, 'vpm', 1000, undefined, 'discovery');
      await db.prepare("UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,lease_expires_at=?,next_fetch_at=? WHERE job_id=?")
        .bind(existingNode, 'native-existing-lease', new Date(clock + 60000).toISOString(), new Date(clock + 86400000).toISOString(), existingJob).run();
      await db.prepare('UPDATE origin_leases SET active_job_id=?,lease_expires_at=? WHERE origin=?')
        .bind(existingJob, new Date(clock + 60000).toISOString(), origin).run();
    }
    await db.prepare("INSERT INTO source_leads(lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,status,first_seen_at,last_seen_at) VALUES (?,?,?,'vpm_listing',?,'pending_review',?,?)")
      .bind(leadKey, sourceUrl, sourceJob, url, new Date(clock).toISOString(), new Date(clock).toISOString()).run();
    const beforeJob = await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(url).first();
    const beforeOrigin = await db.prepare('SELECT * FROM origin_leases WHERE origin=?').bind(origin).first();
    await db.exec("CREATE TRIGGER reject_native_approval_audit BEFORE INSERT ON operator_actions WHEN NEW.action='approve_lead' BEGIN SELECT RAISE(ABORT,'Offline approval audit failure'); END;");
    let failed = false;
    try { await store.approveVpmListingLead(leadKey, 2000, 'offline-fixture', 'Offline approval rollback'); } catch { failed = true; }
    await db.exec('DROP TRIGGER reject_native_approval_audit;');
    check(failed, 'Approval audit failure was not propagated');
    check(JSON.stringify(beforeJob) === JSON.stringify(await db.prepare('SELECT * FROM crawl_jobs WHERE url=?').bind(url).first()),
      'Failed approval changed queue state or lease');
    check(JSON.stringify(beforeOrigin) === JSON.stringify(await db.prepare('SELECT * FROM origin_leases WHERE origin=?').bind(origin).first()),
      'Failed approval changed origin pacing or reservation');
    const lead = await db.prepare('SELECT status FROM source_leads WHERE lead_key=?').bind(leadKey).first();
    check(lead.status === 'pending_review', 'Failed approval changed lead status');
    const jobId = await store.approveVpmListingLead(leadKey, 2000, 'offline-fixture', 'Offline approval retry');
    check(await store.approveVpmListingLead(leadKey, 2000, 'offline-fixture', 'Offline approval replay') === jobId,
      'Approval replay changed job identity');
    const audit = await db.prepare("SELECT COUNT(*) AS count FROM operator_actions WHERE lead_key=? AND action='approve_lead'").bind(leadKey).first();
    check(audit.count === 1, 'Approval replay duplicated its audit');
    const approved = await db.prepare('SELECT status FROM source_leads WHERE lead_key=?').bind(leadKey).first();
    check(approved.status === 'approved', 'Approval retry did not commit lead state');
    if (existing) {
      const retained = await db.prepare('SELECT state,lease_id,next_fetch_at FROM crawl_jobs WHERE url=?').bind(url).first();
      check(retained.state === beforeJob.state && retained.lease_id === beforeJob.lease_id && retained.next_fetch_at === beforeJob.next_fetch_at,
        'Successful approval reset an existing lease or schedule');
    }
  }
}
`;
const discoveryFixtureModule = String.raw`
import { Coordinator } from './storage.mjs';
export async function discoveryFixture(env) {
  const clock = Date.now(), store = new Coordinator(env.VRCP_D1, () => clock), cases = [];
  for (const failAt of [1, 2]) {
    const origin = 'https://native-discovery-' + failAt + '.example';
    const url = origin + '/index.json', nodeId = 'native-discovery-' + failAt;
    await store.createSourceAccessProfile({ schemaVersion: 1, platform: 'vpm', origin,
      pathScope: '/index.json', method: 'GET', purpose: 'discovery', minDelayMs: 1000,
      expiresAt: new Date(clock + 3600000).toISOString(), reviewReference: 'OFFLINE-DISCOVERY-ATOMICITY',
      reason: 'Hermetic discovery rollback fixture', retainClasses: ['normalized_facts'], publishClasses: []
    }, 'offline-fixture');
    await store.recordRobotsSnapshot(origin, 200, 'User-agent: *\nAllow: /');
    await store.seedJob(url, 'vpm', 1000, undefined, 'discovery');
    const token = await store.createNodeCredential(nodeId, ['vpm']);
    const principal = await store.authenticate(nodeId, token);
    const claim = await store.claim({ schemaVersion: 1, nodeId, capabilities: ['vpm'] }, principal);
    if (claim.status !== 'leased' || claim.job.url !== url) throw new Error('Discovery fixture was not leased');
    const leads = [{ kind: 'vpm_listing', url: origin + '/first.json' },
      { kind: 'vpm_listing', url: origin + '/second.json' }];
    const payload = { schemaVersion: 1, nodeId, jobId: claim.job.jobId, leaseId: claim.job.leaseId,
      idempotencyKey: 'native-discovery-' + crypto.randomUUID(), outcome: { kind: 'discovery', leads } };
    await env.VRCP_D1.exec("CREATE TRIGGER reject_native_discovery_lead BEFORE INSERT ON source_leads WHEN NEW.discovered_from_job_id='" +
      claim.job.jobId + "' AND NEW.target_url='" + leads[failAt - 1].url +
      "' BEGIN SELECT RAISE(ABORT,'Offline discovery write failure'); END;");
    let rejected = false;
    try { await store.submit(payload, principal); } catch { rejected = true; }
    await env.VRCP_D1.exec('DROP TRIGGER reject_native_discovery_lead;');
    const receipt = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM job_results WHERE lease_id=?')
      .bind(payload.leaseId).first();
    const leadRows = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const job = await env.VRCP_D1.prepare('SELECT state,lease_id FROM crawl_jobs WHERE job_id=?').bind(payload.jobId).first();
    const reservation = await env.VRCP_D1.prepare('SELECT active_job_id FROM origin_leases WHERE origin=?').bind(origin).first();
    const events = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_events WHERE submission_lease_id=?')
      .bind(payload.leaseId).first();
    const accepted = await store.submit(payload, principal);
    const committed = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const replay = await store.submit(payload, principal);
    const replayed = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM source_leads WHERE discovered_from_job_id=?')
      .bind(payload.jobId).first();
    const committedReceipts = await env.VRCP_D1.prepare('SELECT COUNT(*) AS count FROM job_results WHERE lease_id=?')
      .bind(payload.leaseId).first();
    cases.push({ failAt, rejected, receiptCount: receipt.count, partialLeadCount: leadRows.count,
      state: job.state, leaseRetained: job.lease_id === payload.leaseId,
      reservationRetained: reservation.active_job_id === payload.jobId, eventCount: events.count,
      accepted, replay, committedLeadCount: committed.count, replayedLeadCount: replayed.count,
      committedReceiptCount: committedReceipts.count });
  }
  return { cases };
}`;
const workerConfig = unstable_readConfig({
	config: fileURLToPath(new URL('../wrangler.toml', import.meta.url))
});
assert.ok(!workerConfig.assets?.directory, 'Runtime smoke requires the API-only Worker');
assert.equal(workerConfig.d1_databases.length, 1);
assert.equal(workerConfig.d1_databases[0].binding, 'VRCP_D1');
assert.notEqual(workerConfig.d1_databases[0].remote, true, 'Remote bindings are forbidden');
let externalFetches = 0;
const runtime = new Miniflare(
	convertV4MiniflareOptions({
		workers: [
			{
				name: 'offline-audit',
				modules: [
					{
						type: 'ESModule',
						path: 'audit-main.mjs',
						contents:
							"import coordinator from './coordinator.mjs';\nimport { refreshFixture } from './refresh-fixture.mjs';\nimport { discoveryFixture } from './discovery-fixture.mjs';\nexport default { async fetch(request,env) {\n  const path=new URL(request.url).pathname;\n  if(path!=='/__fixture' && path!=='/__refresh' && path!=='/__discovery') return coordinator.fetch(request,env);\n  if(request.headers.get('authorization')!=='Bearer '+env.OPERATOR_TOKEN) return new Response('',{status:401});\n  if(path==='/__refresh') return Response.json(await refreshFixture(env));\n  if(path==='/__discovery') return Response.json(await discoveryFixture(env));\n  const now=new Date().toISOString(), expires=new Date(Date.now()+3600000).toISOString();\n  const jobId=crypto.randomUUID();\n  await env.VRCP_D1.prepare('INSERT INTO origin_robots VALUES (?,?,?,?,?,?)')\n    .bind('https://runtime.example',crypto.randomUUID(),200,'User-agent: *\\\\nAllow: /',now,expires).run();\n  await env.VRCP_D1.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')\n    .bind(jobId,'vpm','https://runtime.example/index.json','https://runtime.example','pending',now,now,'metadata').run();\n  await env.VRCP_D1.prepare('INSERT INTO origin_leases VALUES (?,?,?,?,?)')\n    .bind('https://runtime.example',null,null,now,1000).run();\n  return Response.json({status:'offline-fixture-ready'});\n}};"
					},
					{ type: 'ESModule', path: 'storage.mjs', contents: storageModule },
					{ type: 'ESModule', path: 'refresh-fixture.mjs', contents: refreshFixtureModule },
					{ type: 'ESModule', path: 'discovery-fixture.mjs', contents: discoveryFixtureModule },
					{
						type: 'ESModule',
						path: 'coordinator.mjs',
						contents: readFileSync(
							new URL('../.wrangler/api-build/worker_entry.js', import.meta.url),
							'utf8'
						)
					}
				],
				compatibilityDate: workerConfig.compatibility_date,
				compatibilityFlags: workerConfig.compatibility_flags,
				d1Databases: { VRCP_D1: randomUUID() },
				bindings: { OPERATOR_TOKEN: operatorToken },
				outboundService: () => {
					externalFetches++;
					return new Response('External requests disabled', { status: 403 });
				}
			}
		]
	})
);
try {
	const post = async (path, payload, token) => {
		const response = await runtime.dispatchFetch('https://offline.test' + path, {
			method: 'POST',
			signal: AbortSignal.timeout(15_000),
			headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
			body: JSON.stringify(payload)
		});
		assert.ok(response.ok, path + ' returned ' + response.status);
		const body = await response.json();
		console.log(JSON.stringify({ step: path, status: response.status }));
		return body;
	};
  await post('/v1/operator/init', { schemaVersion: 1, autoSeed: true }, operatorToken);
  const anonymousRegistration = await runtime.dispatchFetch('https://offline.test/v1/app/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, appName: 'Anonymous native app' })
  });
  assert.equal(anonymousRegistration.status, 401);
  const reportApp = await post('/v1/app/register', { schemaVersion: 1, appName: 'Operator native app' }, operatorToken);
  const reportStatuses = [];
  const reportingClient = new VRCPackageClient({ baseUrl: 'https://offline.test', appToken: reportApp.appToken,
    fetch: async (input, init) => {
      const response = await runtime.dispatchFetch(String(input), init);
      reportStatuses.push(response.status);
      return response;
    } });
  for (const report of [
    { schemaVersion: 1, reportType: 'demand_signal', signalKind: 'search_miss', query: 'native receipt', zeroHits: true },
    { schemaVersion: 1, reportType: 'issue_report', reportKind: 'wrong_metadata', canonicalId: 'native-receipt-target' },
    { schemaVersion: 1, reportType: 'removal_request', canonicalId: 'native-receipt-target', reason: 'Native receipt fixture' }
  ]) {
    const receipt = await reportingClient.reports.submit(report);
    assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion', 'status', 'reportId', 'recordedAt'].sort());
  }
  assert.deepEqual(reportStatuses, [200, 200, 202]);
  console.log(JSON.stringify({ check: 'native_HTTP_report_sdk_receipts', statuses: reportStatuses, passed: true }));
  for (const token of ['', 'vrcp_usr_' + '0'.repeat(64)]) {
    const removedNodeIssue = await runtime.dispatchFetch('https://offline.test/v1/user/nodes', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ schemaVersion: 1, nodeId: 'retired-node-issue', requestedCapabilities: ['vpm'] })
    });
    assert.equal(removedNodeIssue.status, 404);
    const removed = await runtime.dispatchFetch('https://offline.test/v1/user/delist', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ schemaVersion: 1, targetUrl: 'https://removed.example/product',
        reason: 'Removed route fixture', proofKind: 'dns_txt', proofValue: 'Unverified fixture' })
    });
    assert.equal(removed.status, 404);
  }
  const seedInput = { schemaVersion: 1, url: 'https://native-seed.example/index.json',
    platform: 'vpm', purpose: 'metadata', minDelayMs: 1000, reason: 'Offline native enqueue fixture' };
  const seeded = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
  const repeated = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
  assert.equal(seeded.jobId, repeated.jobId);
  console.log(JSON.stringify({ check: 'native_operator_enqueue_idempotent', passed: true }));
  const ruleInput = { schemaVersion: 1, leadKind: 'vpm_listing', origin: 'https://native-rule.example',
    pathScope: '/index.json', minDelayMs: 1000, expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reviewReference: 'OFFLINE-RULE-REVIEW', reason: 'Hermetic rule contract check' };
  const createdRule = AutoQueueRuleResponseSchema.parse(
    await post('/v1/operator/autoqueue-rules', ruleInput, operatorToken));
  assert.equal(createdRule.rule.pathScope, ruleInput.pathScope);
  for (const change of [{ leadKind: 'storefront_product' }, { pathScope: '/*' },
    { origin: 'http://native-rule.example' }]) {
    const response = await runtime.dispatchFetch('https://offline.test/v1/operator/autoqueue-rules', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + operatorToken },
      body: JSON.stringify({ ...ruleInput, ...change })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'invalid_payload');
  }
  const ruleList = await runtime.dispatchFetch('https://offline.test/v1/operator/autoqueue-rules', {
    headers: { authorization: 'Bearer ' + operatorToken }, signal: AbortSignal.timeout(15_000)
  });
  assert.equal(ruleList.status, 200);
  const listedRules = AutoQueueRuleListResponseSchema.parse(await ruleList.json());
  assert.equal(listedRules.rules.length, 1, 'Rejected rules must not create records');
  assert.equal(listedRules.rules[0].ruleId, createdRule.rule.ruleId);
  console.log(JSON.stringify({ check: 'native_operator_rule_contract', malformedRejected: true,
    rejectedWritesAbsent: true, sdkResponseValidated: true }));
	const profileList = await runtime.dispatchFetch('https://offline.test/v1/operator/source-profiles', {
		headers: { authorization: 'Bearer ' + operatorToken },
		signal: AbortSignal.timeout(15_000)
	});
	assert.equal(profileList.status, 200);
	assert.equal(SourceAccessProfileListResponseSchema.parse(await profileList.json()).profiles.length, 0);
  const refreshCheck = await post('/__refresh', {}, operatorToken);
  assert.equal(refreshCheck.status, 'passed');
  console.log(JSON.stringify({ check: 'native_D1_refresh_ownership', ...refreshCheck }));
  const discoveryCheck = await post('/__discovery', {}, operatorToken);
  console.log(JSON.stringify({ check: 'native_D1_discovery_atomicity', ...discoveryCheck, externalFetches }));
  for (const result of discoveryCheck.cases) {
    const context = 'Discovery insert failure ' + result.failAt;
    assert.equal(result.rejected, true, context + ' must reject submission');
    assert.equal(result.receiptCount, 0, context + ' must roll back the receipt');
    assert.equal(result.partialLeadCount, 0, context + ' must roll back every lead');
    assert.equal(result.eventCount, 0, context + ' must roll back its event');
    assert.equal(result.state, 'leased', context + ' must preserve job state');
    assert.equal(result.leaseRetained, true, context + ' must preserve lease ownership');
    assert.equal(result.reservationRetained, true, context + ' must preserve origin reservation');
    assert.equal(ResultResponseSchema.parse(result.accepted).duplicate, false, context + ' retry must commit');
    assert.equal(result.committedLeadCount, 2, context + ' retry must retain both leads');
    assert.equal(result.committedReceiptCount, 1, context + ' retry must retain one receipt');
    assert.equal(ResultResponseSchema.parse(result.replay).duplicate, true, context + ' replay must be duplicate');
    assert.equal(result.replayedLeadCount, 2, context + ' replay must not change leads');
  }
	const nodes = [];
	for (const nodeId of ['runtime-race-a', 'runtime-race-b']) {
		nodes.push(
			NodeCredentialResponseSchema.parse(
				await post(
					'/v1/operator/nodes',
					{
						schemaVersion: 1,
						nodeId,
						capabilities: ['vpm'],
						reason: 'Offline runtime race fixture'
					},
					operatorToken
				)
			)
		);
	}
	for (const node of nodes) {
		const empty = ClaimResponseSchema.parse(await post('/v1/node/jobs/claim', {
			schemaVersion: 1, nodeId: node.nodeId, capabilities: ['vpm']
		}, node.token));
		assert.equal(empty.status, 'empty', 'Bootstrap candidates must not authorize fetching');
	}
	console.log(JSON.stringify({ check: 'bootstrap_candidates_require_separate_access', passed: true }));
	await post(
		'/v1/operator/source-profiles',
		{
			schemaVersion: 1,
			platform: 'vpm',
			origin: 'https://runtime.example',
			pathScope: '/',
			method: 'GET',
			purpose: 'metadata',
			minDelayMs: 1000,
			expiresAt: new Date(Date.now() + 86400000).toISOString(),
			reviewReference: 'OFFLINE-RUNTIME-ONLY',
			reason: 'Hermetic workerd concurrency fixture',
			retainClasses: ['normalized_facts'],
			publishClasses: []
		},
		operatorToken
	);
	await post('/__fixture', {}, operatorToken);
	const results = await Promise.all(
		nodes.map(async (node) =>
			ClaimResponseSchema.parse(
				await post(
					'/v1/node/jobs/claim',
					{
						schemaVersion: 1,
						nodeId: node.nodeId,
						capabilities: ['vpm']
					},
					node.token
				)
			)
		)
	);
	assert.equal(results.filter((result) => result.status === 'leased').length, 1);
	assert.equal(results.filter((result) => result.status === 'empty').length, 1);
	const winnerIndex = results.findIndex((result) => result.status === 'leased');
	const winner = nodes[winnerIndex],
		claim = results[winnerIndex];
	HeartbeatResponseSchema.parse(
		await post(
			'/v1/node/heartbeat',
			{
				schemaVersion: 1,
				nodeId: winner.nodeId,
				capabilities: ['vpm'],
				state: 'fetching',
				activeJobId: claim.job.jobId,
				activeLeaseId: claim.job.leaseId
			},
			winner.token
		)
	);
	const resultPayload = {
		schemaVersion: 1,
		nodeId: winner.nodeId,
		jobId: claim.job.jobId,
		leaseId: claim.job.leaseId,
		idempotencyKey: randomUUID(),
		outcome: {
			kind: 'changed',
			observation: {
				sourceItemKey: 'com.offline.runtime-smoke',
				title: 'Offline metadata fixture',
				summary: '',
				author: 'Offline fixture publisher',
				outboundLinks: [],
				originUpdatedAt: null
			}
		}
	};
	const receipt = ResultResponseSchema.parse(
		await post('/v1/node/jobs/result', resultPayload, winner.token)
	);
	assert.equal(receipt.status, 'accepted');
	assert.equal(receipt.duplicate, false);
	const replay = ResultResponseSchema.parse(
		await post('/v1/node/jobs/result', resultPayload, winner.token)
	);
	assert.equal(replay.duplicate, true);
	for (const reason of ['Offline revocation fixture', 'Repeated offline revocation']) {
		const revoked = RevokeNodeResponseSchema.parse(await post(
			`/v1/operator/nodes/${winner.nodeId}/revoke`, { schemaVersion: 1, reason }, operatorToken
		));
		assert.equal(revoked.nodeId, winner.nodeId);
		assert.equal(revoked.status, 'revoked');
	}
	for (const [path, payload] of [
		['/v1/node/jobs/claim', { schemaVersion: 1, nodeId: winner.nodeId, capabilities: ['vpm'] }],
		['/v1/node/heartbeat', { schemaVersion: 1, nodeId: winner.nodeId, capabilities: ['vpm'], state: 'idle' }],
		['/v1/node/jobs/result', resultPayload]
	]) {
		const rejected = await runtime.dispatchFetch(`https://offline.invalid${path}`, {
			method: 'POST', headers: { authorization: `Bearer ${winner.token}`, 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		assert.equal(rejected.status, 401);
	}
	assert.equal(externalFetches, 0);
	console.log(
		JSON.stringify({
			check: 'workerd_local_D1_claim_race',
			statuses: results.map((result) => result.status),
			schemaValidated: true,
			resultAccepted: true,
			idempotentReplay: true,
			revocationEnforced: true,
			externalFetches
		})
	);
} finally {
	await runtime.dispose();
}
