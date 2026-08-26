import type { MediaProvider } from '@atlaskit/editor-common/provider-factory';
import type {
  Auth,
  AuthContext,
  MediaClientConfig,
} from '@atlaskit/media-core';

const MEDIA_COLLECTION = 'atlaskit-editor-example';

type MediaAuthResponse = Auth;

function isMediaAuth(value: unknown): value is MediaAuthResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.token === 'string' &&
    typeof candidate.baseUrl === 'string' &&
    (typeof candidate.clientId === 'string' ||
      typeof candidate.asapIssuer === 'string')
  );
}

async function getMediaAuth(context?: AuthContext): Promise<Auth> {
  const response = await fetch(
    `${window.atlassianEditor.mediaApiBaseUrl}/auth`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ context }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to authorize Atlaskit Media (${response.status} ${response.statusText})`,
    );
  }

  const auth: unknown = await response.json();

  if (!isMediaAuth(auth)) {
    throw new Error('The media auth endpoint returned an invalid response');
  }

  return auth;
}

export async function createMediaProvider(): Promise<MediaProvider> {
  const mediaClientConfig: MediaClientConfig = {
    authProvider: getMediaAuth,
  };

  return {
    viewAndUploadMediaClientConfig: mediaClientConfig,
    viewMediaClientConfig: mediaClientConfig,
    uploadMediaClientConfig: mediaClientConfig,
    uploadParams: {
      collection: MEDIA_COLLECTION,
    },
  };
}

/**
 * Image, video, and generic file uploads all use the same Atlaskit Media
 * provider. This example uses the persistent local service in server/.
 */
export const mediaProvider: Promise<MediaProvider> = createMediaProvider();
