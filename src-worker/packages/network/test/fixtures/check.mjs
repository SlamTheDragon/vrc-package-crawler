import { ClaimRequestSchema, ClaimResponseSchema, CrawlJobSchema, ResultRequestSchema,
  ResultResponseSchema, NODE_API_JSON_SCHEMAS } from 'vrc-packages-network/node';
import { EvidenceClassSchema } from 'vrc-packages-network/evidence';
import { isPrivateOrReservedIp } from 'vrc-packages-network/ip-policy';
import { githubApiRepositoryIdentity } from 'vrc-packages-network/source-targets';
import { isItchSearchUrl } from 'vrc-packages-network/source-paths';
import { isVpmVersion, compareVpmVersions } from 'vrc-packages-network/vpm-version';
import { OriginRobotsSnapshotSchema } from 'vrc-packages-network/robots';
import { crawlerUserAgent, ROBOTS_RESTRICTION_TOKENS } from 'vrc-packages-network/identity';
import { retrieveRobotsSnapshot } from 'vrc-packages-network/robots-retrieval';
import { cleanTitle, cleanTrackingParams } from 'vrc-packages-network/catalog-hygiene';

function check(value, message) { if (!value) throw new Error(message); }

export async function checkArtifact() {
  const claim = ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: 'artifact-node', capabilities: ['vpm'] });
  check(claim.nodeId === 'artifact-node', 'Claim identity changed');
  check(!ClaimRequestSchema.safeParse({ ...claim, nodeId: '..' }).success, 'Dot node ID accepted');
  check(!ClaimRequestSchema.safeParse({ ...claim, extra: true }).success, 'Unknown claim field accepted');
  const job = CrawlJobSchema.parse({ jobId: 'artifact-job', leaseId: crypto.randomUUID(), platform: 'vpm',
    purpose: 'metadata', url: 'https://example.org/index.json', origin: 'https://example.org',
    leaseExpiresAt: '2099-01-01T00:00:00.000Z', retainClasses: ['normalized_facts'], etag: null, lastModified: null });
  check(ClaimResponseSchema.parse({ schemaVersion: 1, status: 'leased', job }).status === 'leased', 'Lease changed');
  const result = ResultRequestSchema.parse({ schemaVersion: 1, nodeId: claim.nodeId, jobId: job.jobId,
    leaseId: job.leaseId, idempotencyKey: crypto.randomUUID(), outcome: { kind: 'unchanged' } });
  check(ResultResponseSchema.parse({ schemaVersion: 1, status: 'accepted', jobId: result.jobId,
    duplicate: false, sourceVersionCreated: false }).jobId === job.jobId, 'Receipt changed');
  check(NODE_API_JSON_SCHEMAS.claimRequest.type === 'object', 'JSON schema export missing');
  check(EvidenceClassSchema.parse('normalized_facts') === 'normalized_facts', 'Evidence class changed');
  check(isPrivateOrReservedIp('127.0.0.1') && !isPrivateOrReservedIp('8.8.8.8'), 'IP policy changed');
  check(githubApiRepositoryIdentity('https://api.github.com/repos/example/tools') === 'example/tools', 'Target policy changed');
  check(isItchSearchUrl('https://itch.io/search?q=vrchat'), 'Excluded search path changed');
  check(isVpmVersion('1.2.3') && !isVpmVersion('v1.2.3') && compareVpmVersions('1.2.3', '2.0.0') < 0,
    'SemVer package boundary changed');
  check(OriginRobotsSnapshotSchema.parse({ origin: 'https://example.org', statusCode: 404, body: '' }).body === '',
    'Robots snapshot changed');
  const userAgent = crawlerUserAgent('0.0.0');
  check(userAgent.startsWith('VRCPDiscoveryBot/0.0.0 '), 'Bot identity changed');
  check(ROBOTS_RESTRICTION_TOKENS.includes('VRCDiscoveryBot'), 'Earlier refusal token lost');
  const snapshot = await retrieveRobotsSnapshot({ origin: 'https://example.org', userAgent }, async (_url, init) => {
    check(init.redirect === 'manual' && new Headers(init.headers).get('user-agent') === userAgent,
      'Robots transport contract changed');
    return new Response(null, { status: 404 });
  });
  check(snapshot.statusCode === 404 && snapshot.body === '', 'Robots retrieval changed');
  check(cleanTitle(' Example Tool ') === 'Example Tool', 'Title hygiene changed');
  check(cleanTrackingParams('https://example.org/item?utm_source=fixture') === 'https://example.org/item',
    'Link hygiene changed');
  return { nodeContracts: true, strictIdentity: true, policy: true, robots: true, semver: true, hygiene: true };
}
