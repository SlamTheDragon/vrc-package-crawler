import { VrcPackagesClient, type VrcPackagesClientOptions } from 'vrc-packages-api';
import { RevokeNodeRequestSchema } from 'vrc-packages-api/protocol';
import { type Platform } from 'vrc-packages-api/types';
import { isVpmVersion } from 'vrc-packages-api/taxonomy';
import { isAppToken } from 'vrc-packages-api/auth';

const options: VrcPackagesClientOptions = { baseUrl: 'https://example.test' };
const client = new VrcPackagesClient(options);
const platform: Platform = 'vpm';
RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Type fixture' });
void [client, platform, isVpmVersion, isAppToken];
