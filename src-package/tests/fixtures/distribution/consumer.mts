import { VrcPackagesClient, type VrcPackagesClientOptions } from 'vrc-packages-api';
import { RevokeNodeRequestSchema, type PublicCatalogListQuery,
  type PublicCatalogListResponse } from 'vrc-packages-api/protocol';
import { type Platform } from 'vrc-packages-api/types';
import { UmbrellaSchema } from 'vrc-packages-api/taxonomy';
import { isAppToken } from 'vrc-packages-api/auth';

// @ts-expect-error Coordinator classification types are not consumer API contracts.
import type { DesktopToolSubtype } from 'vrc-packages-api/taxonomy';
// @ts-expect-error Coordinator evidence is private, not a published API response.
import type { DesktopToolEvidence } from 'vrc-packages-api';
// @ts-expect-error Coordinator compatibility storage is not a published API response.
import type { AvatarCompatibility } from 'vrc-packages-api';

const options: VrcPackagesClientOptions = { baseUrl: 'https://example.test' };
const client = new VrcPackagesClient(options);
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
