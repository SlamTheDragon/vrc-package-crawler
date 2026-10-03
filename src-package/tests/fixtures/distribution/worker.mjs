import { VrcPackagesClient } from 'vrc-packages-api';
import { RevokeNodeRequestSchema } from 'vrc-packages-api/protocol';
import { PlatformSchema } from 'vrc-packages-api/types';
import { UmbrellaSchema } from 'vrc-packages-api/taxonomy';
import { formatAppToken, isAppToken } from 'vrc-packages-api/auth';

export default {
  fetch() {
    const client = new VrcPackagesClient({ baseUrl: 'https://example.test' });
    return Response.json({
      platform: PlatformSchema.parse('vpm'), umbrella: UmbrellaSchema.parse('tools'),
      tokenValid: isAppToken(formatAppToken('0'.repeat(64))), clientReady: !!client.operator,
      reason: RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Packed Worker fixture' }).reason
    });
  }
};
