import type { MediaProvider } from '@atlaskit/editor-common/provider-factory';
import type { AuthContext } from '@atlaskit/media-core';

import type { ExportRenderDocument } from '../../shared';

export async function createExportMediaProvider(
  payload: Pick<
    ExportRenderDocument,
    'mediaBaseUrl' | 'nonce' | 'operationId'
  >,
): Promise<MediaProvider> {
  return {
    viewMediaClientConfig: {
      authProvider: async (_context?: AuthContext) => ({
        clientId: payload.operationId,
        token: payload.nonce,
        baseUrl: payload.mediaBaseUrl,
      }),
    },
  };
}
