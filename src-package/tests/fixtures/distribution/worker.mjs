import { VRCPackageClient } from 'vrc-packages-api';
import { RevokeNodeRequestSchema, encodeCatalogCursor } from 'vrc-packages-api/protocol';
import { PlatformSchema } from 'vrc-packages-api/types';
import { UmbrellaSchema } from 'vrc-packages-api/taxonomy';
import { formatAppToken, isAppToken } from 'vrc-packages-api/auth';

export default {
  async fetch() {
    const cursor = encodeCatalogCursor({ createdAt: '2026-10-01T12:00:00.000Z', canonicalId: 'packed-item' });
    const client = new VRCPackageClient({ baseUrl: 'https://example.test', fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method !== 'GET' || url.pathname !== '/v1/app/index' ||
          request.headers.has('authorization') || url.searchParams.size !== 2 ||
          url.searchParams.get('limit') !== '100' || url.searchParams.get('cursor') !== cursor) {
        throw new Error('Packed public index request changed');
      }
      return Response.json({ schemaVersion: 1, packages: [], nextCursor: cursor });
    } });
    const page = await client.index.query({ limit: 100, cursor });
    return Response.json({
      platform: PlatformSchema.parse('vpm'), umbrella: UmbrellaSchema.parse('tools'),
      tokenValid: isAppToken(formatAppToken('0'.repeat(64))), clientReady: !!client.operator,
      publicIndex: page.schemaVersion === 1 && page.nextCursor === cursor && !('count' in page),
      reason: RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason: 'Packed Worker fixture' }).reason
    });
  }
};
