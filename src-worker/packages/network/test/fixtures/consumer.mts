import { ClaimRequestSchema, type ClaimRequest, type CrawlJob, type ResultRequest,
  type ResultResponse } from 'vrc-packages-network/node';
import { type EvidenceClass } from 'vrc-packages-network/evidence';
import { type OriginRobotsSnapshot } from 'vrc-packages-network/robots';
import { type RobotsFetcher, retrieveRobotsSnapshot } from 'vrc-packages-network/robots-retrieval';
import { crawlerUserAgent } from 'vrc-packages-network/identity';

const claim: ClaimRequest = ClaimRequestSchema.parse({ schemaVersion: 1, nodeId: 'types-node', capabilities: ['vpm'] });
const evidence: EvidenceClass = 'normalized_facts';
const job: CrawlJob = { jobId: 'types-job', leaseId: crypto.randomUUID(), platform: 'vpm', purpose: 'metadata',
  url: 'https://example.org/index.json', origin: 'https://example.org', leaseExpiresAt: '2099-01-01T00:00:00.000Z',
  retainClasses: [evidence], etag: null, lastModified: null };
const result: ResultRequest = { schemaVersion: 1, nodeId: claim.nodeId, jobId: job.jobId,
  leaseId: job.leaseId, idempotencyKey: crypto.randomUUID(), outcome: { kind: 'unchanged' } };
const receipt: ResultResponse = { schemaVersion: 1, status: 'accepted', jobId: result.jobId,
  duplicate: false, sourceVersionCreated: false };
const fetcher: RobotsFetcher = async () => new Response(null, { status: 404 });
const snapshot: OriginRobotsSnapshot = await retrieveRobotsSnapshot({ origin: job.origin,
  userAgent: crawlerUserAgent('0.0.0') }, fetcher);
void receipt; void snapshot;

// @ts-expect-error Node job contracts are not consumer SDK exports.
import { CrawlJobSchema } from 'vrc-packages-api';
// @ts-expect-error Package source paths are not published exports.
import { PlatformSchema } from 'vrc-packages-network/src/protocol/node_protocol.ts';
// @ts-expect-error Wrong protocol version must not satisfy the declared request.
const invalidClaim: ClaimRequest = { schemaVersion: 2, nodeId: 'types-node', capabilities: ['vpm'] };
void CrawlJobSchema; void PlatformSchema; void invalidClaim;
