import { VrcPackagesClient, type VrcPackagesClientOptions } from 'vrc-packages-api';
import { RevokeNodeRequestSchema } from 'vrc-packages-api/protocol';
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
