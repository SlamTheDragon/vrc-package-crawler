import { VRCPackageClient, type VRCPackageClientOptions } from 'vrc-packages-api';
import { RevokeNodeRequestSchema, type PublicCatalogListQuery,
  type PublicCatalogListResponse } from 'vrc-packages-api/protocol';
import { type Platform } from 'vrc-packages-api/types';
import { UmbrellaSchema } from 'vrc-packages-api/taxonomy';
import { isAppToken } from 'vrc-packages-api/auth';

// @ts-expect-error Version-zero SDK does not retain the old client spelling.
import { VRCPackagesClient } from 'vrc-packages-api';
// @ts-expect-error Version-zero SDK does not retain the old options spelling.
import type { VRCPackagesClientOptions } from 'vrc-packages-api';
// @ts-expect-error The P in VRCP already stands for Packages.
import { VRCPPackageClient } from 'vrc-packages-api';
// @ts-expect-error The options name must not repeat Package after VRCP.
import type { VRCPPackageClientOptions } from 'vrc-packages-api';

// @ts-expect-error Coordinator classification types are not consumer API contracts.
import type { DesktopToolSubtype } from 'vrc-packages-api/taxonomy';
// @ts-expect-error Coordinator evidence is private, not a published API response.
import type { DesktopToolEvidence } from 'vrc-packages-api';
// @ts-expect-error Coordinator compatibility storage is not a published API response.
import type { AvatarCompatibility } from 'vrc-packages-api';

const options: VRCPackageClientOptions = { baseUrl: 'https://example.test' };
const client = new VRCPackageClient(options);
const platform: Platform = 'vpm';
RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Type fixture' });
void [client, platform, UmbrellaSchema, isAppToken];

async function checkPublicIndexTypes() {
  const query: PublicCatalogListQuery = { limit: 100 };
  const page: PublicCatalogListResponse = await client.index.query(query);
  const version: 1 = page.schemaVersion;
  const cursor: string | null = page.nextCursor;
  if (cursor) await client.index.query({ cursor });
  // @ts-expect-error Public index is unfiltered. Search requires the authenticated search route.
  await client.index.query({ query: 'avatar' });
  // @ts-expect-error A page receipt has no synthetic total count.
  void page.count;
  void version;
}
void checkPublicIndexTypes;

async function checkSearchPaginationTypes() {
  const page = await client.index.search({ queryOrigin: 'app_automated', cursor: null, limit: 1 });
  if (page.nextCursor) await client.index.search({ queryOrigin: 'app_automated', cursor: page.nextCursor, limit: 1 });
  // @ts-expect-error Search cursors are nullable text, not numeric offsets.
  await client.index.search({ queryOrigin: 'app_automated', cursor: 1 });
}
void checkSearchPaginationTypes;

async function checkStrictLeadTypes() {
  const page = await client.operator.leads.list();
  for (const lead of page.leads) {
    const key: string = lead.lead_key;
    // @ts-expect-error Lead wire rows have no camel-case alias.
    void lead.leadKey;
    await client.operator.leads.approve(key, { reason: 'Reviewed listing' });
    // @ts-expect-error Operators must supply an approval reason.
    await client.operator.leads.approve(key);
    // @ts-expect-error Operators must supply a rejection reason.
    await client.operator.leads.reject(key, {});
  }
}
void checkStrictLeadTypes;
