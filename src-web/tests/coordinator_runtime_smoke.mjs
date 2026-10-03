// Offline-only workerd/D1 smoke. Requires the installed src-web dependencies and Node with TypeScript stripping.
// Run from any directory after: cd src-web; bun run build
// Then: node src-web/tests/coordinator_runtime_smoke.mjs
// The fixture module is in memory only. Never deploy it or use remote bindings.
// Current installed Miniflare 5 alpha needs its supplied option conversion API.
import { Miniflare, convertV4MiniflareOptions } from '../node_modules/miniflare/dist/src/index.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { unstable_readConfig } from 'wrangler';
import {
	ClaimResponseSchema,
	HeartbeatResponseSchema,
	ResultResponseSchema
} from '../../src-crawler/src/shared/protocol/node_protocol.ts';
import { NodeCredentialResponseSchema } from '../../src-crawler/src/shared/protocol/operator_protocol.ts';
import { SourceAccessProfileListResponseSchema } from '../../src-crawler/src/shared/policy/source_access_profile.ts';
import { EnqueueJobResponseSchema } from '../../src-package/src/protocol/operator.ts';
const operatorToken = randomBytes(32).toString('hex');
const workerConfig = unstable_readConfig({
	config: fileURLToPath(new URL('../wrangler.toml', import.meta.url))
});
assert.ok(!workerConfig.assets?.directory, 'Runtime smoke requires the API-only Worker');
assert.equal(workerConfig.d1_databases.length, 1);
assert.equal(workerConfig.d1_databases[0].binding, 'DB');
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
							"import coordinator from './coordinator.mjs';\nexport default { async fetch(request,env) {\n  if(new URL(request.url).pathname!=='/__fixture') return coordinator.fetch(request,env);\n  if(request.headers.get('authorization')!=='Bearer '+env.OPERATOR_TOKEN) return new Response('',{status:401});\n  const now=new Date().toISOString(), expires=new Date(Date.now()+3600000).toISOString();\n  const jobId=crypto.randomUUID();\n  await env.DB.prepare('INSERT INTO origin_robots VALUES (?,?,?,?,?,?)')\n    .bind('https://runtime.example',crypto.randomUUID(),200,'User-agent: *\\\\nAllow: /',now,expires).run();\n  await env.DB.prepare('INSERT INTO crawl_jobs(job_id,platform,url,origin,state,next_fetch_at,created_at,job_purpose) VALUES (?,?,?,?,?,?,?,?)')\n    .bind(jobId,'vpm','https://runtime.example/index.json','https://runtime.example','pending',now,now,'metadata').run();\n  await env.DB.prepare('INSERT INTO origin_leases VALUES (?,?,?,?,?)')\n    .bind('https://runtime.example',null,null,now,1000).run();\n  return Response.json({status:'offline-fixture-ready'});\n}};"
					},
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
				d1Databases: { DB: randomUUID() },
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
  const seedInput = { schemaVersion: 1, url: 'https://native-seed.example/index.json',
    platform: 'vpm', purpose: 'metadata', minDelayMs: 1000, reason: 'Offline native enqueue fixture' };
  const seeded = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
  const repeated = EnqueueJobResponseSchema.parse(await post('/v1/operator/jobs', seedInput, operatorToken));
  assert.equal(seeded.jobId, repeated.jobId);
  console.log(JSON.stringify({ check: 'native_operator_enqueue_idempotent', passed: true }));
	const profileList = await runtime.dispatchFetch('https://offline.test/v1/operator/source-profiles', {
		headers: { authorization: 'Bearer ' + operatorToken },
		signal: AbortSignal.timeout(15_000)
	});
	assert.equal(profileList.status, 200);
	assert.equal(SourceAccessProfileListResponseSchema.parse(await profileList.json()).profiles.length, 0);
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
	assert.equal(externalFetches, 0);
	console.log(
		JSON.stringify({
			check: 'workerd_local_D1_claim_race',
			statuses: results.map((result) => result.status),
			schemaValidated: true,
			resultAccepted: true,
			idempotentReplay: true,
			externalFetches
		})
	);
} finally {
	await runtime.dispose();
}
