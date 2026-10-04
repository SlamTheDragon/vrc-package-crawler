import assert from 'node:assert/strict';
import { VRCPackageClient, VRCPApiError, PlatformSchema } from 'vrc-packages-api';
import { RevokeNodeRequestSchema, LeadCursorSchema, encodeLeadCursor, decodeLeadCursor,
  CreateSourceAccessProfileSchema, isCanonicalSourceAccessPath, CreateAutoQueueRuleSchema,
  NodeCredentialResponseSchema, encodeCatalogCursor, PublicCatalogListQuerySchema } from 'vrc-packages-api/protocol';
import { encodeCatalogDeltaCursor, CatalogDeltaQuerySchema, OperatorLeadListQuerySchema } from 'vrc-packages-api/protocol';
import { LeadRowSchema, ApproveLeadSchema, RejectLeadSchema } from 'vrc-packages-api/protocol';
import { ReportSubmissionRequestSchema } from 'vrc-packages-api/protocol';
import { CatalogPackageSchema } from 'vrc-packages-api/types';
import * as taxonomy from 'vrc-packages-api/taxonomy';
import * as sdkExports from 'vrc-packages-api';
import { formatAppToken, isAppToken } from 'vrc-packages-api/auth';

assert.equal(PlatformSchema.parse('vpm'), 'vpm');
assert.equal(typeof VRCPackageClient, 'function');
assert.equal(typeof VRCPApiError, 'function');
assert.equal(new VRCPApiError(403, 'Fixture rejection').name, 'VRCPApiError');
for (const retiredName of ['VrcPackagesClient', 'VrcApiError', 'VRCPPackageClient', 'VRCPPackagesClient']) {
  assert.equal(Object.hasOwn(sdkExports, retiredName), false);
}
const publicCursor = encodeCatalogCursor({ createdAt: '2026-10-01T12:00:00.000Z', canonicalId: 'packed-item' });
assert.deepEqual(PublicCatalogListQuerySchema.parse({}), { limit: 50 });
let publicRequests = 0;
const publicIndex = new VRCPackageClient({ baseUrl: 'https://packed-worker.test',
  fetch: async (input, init) => {
    publicRequests++;
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(request.method, 'GET');
    assert.equal(url.pathname, '/v1/app/index');
    assert.equal(request.headers.has('authorization'), false);
    assert.deepEqual([...url.searchParams], [['limit', '100'], ['cursor', publicCursor]]);
    return Response.json(publicRequests === 1
      ? { schemaVersion: 1, packages: [], nextCursor: publicCursor }
      : { packages: [], count: 0 });
  } });
assert.deepEqual(await publicIndex.index.query({ limit: 100, cursor: publicCursor }),
  { schemaVersion: 1, packages: [], nextCursor: publicCursor });
await assert.rejects(publicIndex.index.query({ limit: 100, cursor: publicCursor }), { name: 'ZodError' });
for (const query of [{ query: 'unsupported' }, { limit: 101 }, { cursor: btoa('{}') }]) {
  await assert.rejects(publicIndex.index.query(query), { name: 'ZodError' });
}
assert.equal(publicRequests, 2);
assert.equal('delist' in new VRCPackageClient({ baseUrl: 'https://packed-worker.test' }).user, false);
assert.equal('registerApp' in new VRCPackageClient({ baseUrl: 'https://packed-worker.test' }).user, false);
assert.equal('registerNode' in new VRCPackageClient({ baseUrl: 'https://packed-worker.test' }).user, false);
const ownedApp = { appId: '00000000-0000-4000-8000-000000000002', appName: 'Packed owned app',
  permissions: ['catalog:search'], createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null };
const userViews = new VRCPackageClient({ baseUrl: 'https://packed-worker.test', userToken: 'packed-test-user',
  fetch: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.get('authorization'), 'Bearer packed-test-user');
    return Response.json(new URL(request.url).pathname.endsWith(ownedApp.appId)
      ? { schemaVersion: 1, app: ownedApp } : { schemaVersion: 1, apps: [ownedApp], nextCursor: null });
  } });
assert.deepEqual((await userViews.user.apps.list()).apps, [ownedApp]);
assert.deepEqual((await userViews.user.apps.get(ownedApp.appId)).app, ownedApp);
let anonymousRegistrationCalls = 0;
const anonymousRegistration = new VRCPackageClient({ baseUrl: 'https://packed-worker.test',
  fetch: async () => { anonymousRegistrationCalls++; return Response.json({}); } });
await assert.rejects(anonymousRegistration.app.register({ schemaVersion: 1, appName: 'Anonymous packed app' }),
  error => error instanceof VRCPApiError && error.status === 401);
assert.equal(anonymousRegistrationCalls, 0);
assert.equal(RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Packed fixture' }).reason, 'Packed fixture');
assert.equal(typeof CatalogPackageSchema.parse, 'function');
assert.equal(taxonomy.UmbrellaSchema.parse('tools'), 'tools');
assert.deepEqual(Object.keys(taxonomy), ['UmbrellaSchema']);
for (const name of ['isVpmVersion', 'compareVpmVersions', 'cleanVpmVersion',
  'DesktopToolSubtypeSchema', 'DesktopToolEvidenceSchema', 'AvatarCompatibilitySchema']) {
  assert.equal(name in taxonomy, false);
  assert.equal(name in sdkExports, false);
}
assert.equal(isAppToken(formatAppToken('0'.repeat(64))), true);
const cursor = { status: 'pending_review', firstSeenAt: '2026-10-01T12:00:00.000Z', leadKey: 'a'.repeat(64) };
assert.deepEqual(decodeLeadCursor(encodeLeadCursor(cursor), 'pending_review'), cursor);
assert.equal(decodeLeadCursor(encodeLeadCursor(cursor), 'rejected'), null);
assert.equal(LeadCursorSchema.safeParse({ leadKey: cursor.leadKey }).success, false);
const profile = { schemaVersion: 1, platform: 'vpm', origin: 'https://packages.example.org',
  pathScope: '/index.json', method: 'GET', purpose: 'discovery', minDelayMs: 1000,
  expiresAt: '2027-01-01T00:00:00.000Z', reviewReference: 'Packed fixture review',
  reason: 'Packed profile fixture', retainClasses: ['normalized_facts'], publishClasses: [] };
assert.equal(CreateSourceAccessProfileSchema.safeParse(profile).success, true);
assert.equal(CreateSourceAccessProfileSchema.safeParse({ ...profile, pathScope: '/*' }).success, false);
assert.equal(CreateSourceAccessProfileSchema.safeParse({ ...profile, publishClasses: ['creator_prose'] }).success, false);
assert.equal(isCanonicalSourceAccessPath('/ja/%E3%81%82'), true);
assert.equal(isCanonicalSourceAccessPath('/ja/%2F'), false);
const rule = { schemaVersion: 1, leadKind: 'vpm_listing', origin: profile.origin,
  pathScope: '/index.json', minDelayMs: 1000, expiresAt: profile.expiresAt,
  reviewReference: 'Packed rule review', reason: 'Packed rule fixture' };
assert.equal(CreateAutoQueueRuleSchema.safeParse(rule).success, true);
assert.equal(CreateAutoQueueRuleSchema.safeParse({ ...rule, leadKind: 'storefront_product' }).success, false);
assert.equal(CreateAutoQueueRuleSchema.safeParse({ ...rule, pathScope: '/*' }).success, false);
const credential = { schemaVersion: 1, nodeId: 'packed-fixture', capabilities: ['vpm'],
  token: 'vrcp_' + '0'.repeat(64) + '0004' };
for (const schema of [NodeCredentialResponseSchema]) {
  assert.equal(schema.safeParse(credential).success, true);
  assert.equal(schema.safeParse({ ...credential, nodeId: '' }).success, false);
  assert.equal(schema.safeParse({ ...credential, capabilities: [] }).success, false);
}
await assert.rejects(import('vrc-packages-api/src/client.ts'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
let requests = 0;
const transportClient = new VRCPackageClient({ baseUrl: 'https://packed-worker.test/',
  operatorToken: 'packed-test-only', fetch: async (input, init) => {
    requests++;
    const request = new Request(input, init);
    assert.equal(request.url, 'https://packed-worker.test/v1/operator/init');
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'manual');
    assert.equal(request.headers.get('authorization'), 'Bearer packed-test-only');
    assert.equal(request.headers.get('content-type'), 'application/json');
    assert.deepEqual(await request.json(), { schemaVersion: 1, autoSeed: false });
    if (requests === 1) return Response.json({ schemaVersion: 1, status: 'ok',
      message: 'Schema initialized', autoSeed: false });
    if (requests === 2) return Response.json({ status: 'ok', autoSeed: false });
    return new Response('<html>Upstream unavailable</html>', { status: 503 });
  } });
assert.deepEqual(await transportClient.operator.init({ autoSeed: false }), {
  schemaVersion: 1, status: 'ok', message: 'Schema initialized', autoSeed: false });
await assert.rejects(transportClient.operator.init({ autoSeed: false }), { name: 'ZodError' });
await assert.rejects(transportClient.operator.init({ autoSeed: false }), error =>
  error instanceof VRCPApiError && error.status === 503 &&
  error.details === '<html>Upstream unavailable</html>');
assert.equal(requests, 3);
assert.equal(ReportSubmissionRequestSchema.safeParse({ schemaVersion: 1, reportType: 'removal_request',
  canonicalId: 'packed-target', reason: 'Packed removal test' }).success, true);
const reportClient = new VRCPackageClient({ baseUrl: 'https://packed-worker.test', appToken: 'packed-test-only',
  fetch: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).pathname, '/v1/app/report');
    assert.equal(request.headers.get('authorization'), 'Bearer packed-test-only');
    assert.equal(ReportSubmissionRequestSchema.parse(await request.json()).reportType, 'removal_request');
    return Response.json({ schemaVersion: 1, status: 'accepted', reportId: '00000000-0000-4000-8000-000000000001',
      recordedAt: '2026-10-01T12:00:00.000Z' }, { status: 202 });
  } });
assert.equal((await reportClient.reports.submit({ schemaVersion: 1, reportType: 'removal_request',
  canonicalId: 'packed-target', reason: 'Packed removal test' })).status, 'accepted');
const searchBodies = [];
const searchClient = new VRCPackageClient({ baseUrl: 'https://packed-worker.test', appToken: 'packed-test-only',
  fetch: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).pathname, '/v1/app/index/search');
    assert.equal(request.headers.get('authorization'), 'Bearer packed-test-only');
    searchBodies.push(await request.json());
    return Response.json({ schemaVersion: 1, items: [], nextCursor: 'packed-next-cursor', totalEstimated: 2 });
  } });
const searchPage = await searchClient.index.search({ queryOrigin: 'app_automated', cursor: null, limit: 1 });
await searchClient.index.search({ queryOrigin: 'app_automated', cursor: searchPage.nextCursor, limit: 1 });
assert.deepEqual(searchBodies, [
  { schemaVersion: 1, queryOrigin: 'app_automated', limit: 1, cursor: null },
  { schemaVersion: 1, queryOrigin: 'app_automated', limit: 1, cursor: 'packed-next-cursor' }
]);
await assert.rejects(searchClient.index.search({ queryOrigin: 'app_automated', limit: 51 }), { name: 'ZodError' });
assert.equal(searchBodies.length, 2);
const deltaCursor = encodeCatalogDeltaCursor({ updatedAt: '2026-10-04T00:00:00.000Z', canonicalId: 'packed-item' });
assert.deepEqual(CatalogDeltaQuerySchema.parse({ cursor: deltaCursor }), { limit: 50, cursor: deltaCursor });
assert.deepEqual(OperatorLeadListQuerySchema.parse({}), { limit: 100, status: 'pending_review' });
let deltaRequests = 0;
const deltaClient = new VRCPackageClient({ baseUrl: 'https://packed-worker.test', fetch: async (input) => {
  deltaRequests++;
  const url = new URL(String(input));
  assert.equal(url.pathname, '/v1/app/index/delta');
  assert.equal(url.searchParams.get('cursor'), deltaCursor);
  assert.equal(url.searchParams.get('limit'), '50');
  return Response.json({ schemaVersion: 1, epoch: 'packed-epoch', deltas: [], nextCursor: null });
} });
await deltaClient.index.syncDeltas({ cursor: deltaCursor });
await assert.rejects(deltaClient.index.syncDeltas({ cursor: 'YWJj' }), { name: 'ZodError' });
await assert.rejects(deltaClient.index.syncDeltas({ limit: 101 }), { name: 'ZodError' });
assert.equal(deltaRequests, 1);
const lead = { lead_key: 'a'.repeat(64), kind: 'vpm_listing', target_url: 'https://publisher.example/index.json',
  claimed_package_id: null, discovered_from_url: 'https://directory.example/catalog', discovered_from_item_key: null,
  status: 'pending_review', first_seen_at: '2026-10-04T00:00:00.000Z', last_seen_at: '2026-10-04T00:00:00.000Z' };
assert.deepEqual(LeadRowSchema.parse(lead), lead);
assert.equal(LeadRowSchema.safeParse({ ...lead, leadKey: lead.lead_key }).success, false);
for (const schema of [ApproveLeadSchema, RejectLeadSchema]) assert.equal(schema.safeParse({ schemaVersion: 1 }).success, false);
console.log('packed_node_exports_passed');
