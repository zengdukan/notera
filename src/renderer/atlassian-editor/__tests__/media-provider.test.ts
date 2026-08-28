/** @jest-environment jsdom */

import { createMediaProvider, mediaProviderForNote } from '../media-provider';

const noteId = '20000000-0000-4000-8000-000000000001';

describe('Atlassian Media provider', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'atlassianEditor', {
      configurable: true,
      value: Object.freeze({
        mediaApiBaseUrl: 'http://127.0.0.1:43125/api/media',
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('authorizes all Media clients through the preload runtime address', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        baseUrl: 'http://127.0.0.1:43125/api/media',
        clientId: 'local-atlaskit-editor',
        token: 'local-media-service',
      }),
      status: 200,
      statusText: 'OK',
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    const provider = await createMediaProvider(noteId);
    const { uploadMediaClientConfig } = provider;

    expect(uploadMediaClientConfig).toBeDefined();
    if (!uploadMediaClientConfig) {
      throw new Error('Expected an upload Media client configuration');
    }

    await expect(
      uploadMediaClientConfig.authProvider({
        collectionName: 'atlaskit-editor-example',
      }),
    ).resolves.toMatchObject({ token: 'local-media-service' });
    expect(provider.viewAndUploadMediaClientConfig).toBe(
      provider.uploadMediaClientConfig,
    );
    expect(provider.viewMediaClientConfig).toBe(
      provider.uploadMediaClientConfig,
    );
    expect(provider.uploadParams).toEqual({
      collection: `notera-note-${noteId}`,
      onUploadRejection: expect.any(Function),
    });
    expect(
      provider.uploadParams?.onUploadRejection?.({
        reason: 'fileEmpty',
        fileName: 'empty.txt',
      }),
    ).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:43125/api/media/auth',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          noteId,
          context: { collectionName: `notera-note-${noteId}` },
        }),
      }),
    );
    expect(mediaProviderForNote(noteId)).toBe(mediaProviderForNote(noteId));
  });

  it('rejects malformed auth responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'missing-base-url' }),
      status: 200,
      statusText: 'OK',
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    const provider = await createMediaProvider(noteId);
    const { uploadMediaClientConfig } = provider;

    expect(uploadMediaClientConfig).toBeDefined();
    if (!uploadMediaClientConfig) {
      throw new Error('Expected an upload Media client configuration');
    }

    await expect(uploadMediaClientConfig.authProvider()).rejects.toThrow(
      'The media auth endpoint returned an invalid response',
    );
  });
});
