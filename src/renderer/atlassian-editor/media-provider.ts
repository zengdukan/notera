import type { MediaProvider } from '@atlaskit/editor-common/provider-factory';
import type {
  Auth,
  AuthContext,
  MediaClientConfig,
} from '@atlaskit/media-core';
import { mediaCollectionForNote } from '../../shared/atlassian-editor/media-runtime';
import { publishMediaUploadRejection } from './media-upload-feedback';

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

async function getMediaAuth(
  noteId: string,
  collection: string,
  context?: AuthContext,
): Promise<Auth> {
  const response = await fetch(
    `${window.atlassianEditor.mediaApiBaseUrl}/auth`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        noteId,
        context: { ...(context ?? {}), collectionName: collection },
      }),
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

export async function createMediaProvider(
  noteId: string,
): Promise<MediaProvider> {
  const collection = mediaCollectionForNote(noteId);
  const mediaClientConfig: MediaClientConfig = {
    authProvider: (context) => getMediaAuth(noteId, collection, context),
  };

  return {
    viewAndUploadMediaClientConfig: mediaClientConfig,
    viewMediaClientConfig: mediaClientConfig,
    uploadMediaClientConfig: mediaClientConfig,
    uploadParams: {
      collection,
      onUploadRejection: (data) => {
        if (data.reason !== 'fileSizeLimitExceeded') return false;
        publishMediaUploadRejection({
          noteId,
          fileName: data.fileName,
          limitBytes: data.limit,
        });
        return true;
      },
    },
  };
}

const providers = new Map<string, Promise<MediaProvider>>();

export function mediaProviderForNote(noteId: string): Promise<MediaProvider> {
  let provider = providers.get(noteId);
  if (provider === undefined) {
    provider = createMediaProvider(noteId);
    providers.set(noteId, provider);
  }
  return provider;
}
