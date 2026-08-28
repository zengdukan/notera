import { createMediaSessionRegistry } from '../session-registry';

const profileId = '10000000-0000-4000-8000-000000000001';
const noteId = '20000000-0000-4000-8000-000000000001';
const origin = 'null';

describe('MediaSessionRegistry', () => {
  it('issues a 32-byte token bound to the current profile, note, collection, and origin', () => {
    let now = 1_000;
    const registry = createMediaSessionRegistry({
      apiBaseUrl: 'http://127.0.0.1:43125/api/media',
      allowedOrigin: origin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      randomBytes: () => new Uint8Array(32).fill(7),
      now: () => now,
    });
    const auth = registry.issue({ localProfileId: profileId, noteId });
    expect(Buffer.from(auth.token, 'base64url')).toHaveLength(32);
    expect(auth.collection).toContain(noteId);

    const request = new Request(`${auth.baseUrl}/items`, {
      headers: {
        Origin: origin,
        Authorization: `Bearer ${auth.token}`,
        'X-Client-Id': auth.clientId,
      },
    });
    expect(registry.authorize(request)).toMatchObject({
      localProfileId: profileId,
      noteId,
      collection: auth.collection,
    });

    now = auth.expiresAt;
    expect(() => registry.authorize(request)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('rejects wrong origins, cross-profile sessions, and revoked tokens', () => {
    let currentProfileId = profileId;
    const registry = createMediaSessionRegistry({
      apiBaseUrl: 'http://127.0.0.1:43125/api/media',
      allowedOrigin: origin,
      getSessionState: () => ({
        state: 'UNLOCKED',
        localProfileId: currentProfileId,
      }),
      randomBytes: () => new Uint8Array(32).fill(9),
      now: () => 1_000,
    });
    const auth = registry.issue({ localProfileId: profileId, noteId });
    const request = (requestOrigin = origin) =>
      new Request(`${auth.baseUrl}/file/${noteId}`, {
        headers: {
          Origin: requestOrigin,
          Authorization: `Bearer ${auth.token}`,
          'X-Client-Id': auth.clientId,
        },
      });

    expect(() => registry.authorize(request('https://evil.invalid'))).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    currentProfileId = '10000000-0000-4000-8000-000000000002';
    expect(() => registry.authorize(request())).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    currentProfileId = profileId;
    registry.revokeProfile(profileId);
    expect(() => registry.authorize(request())).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });

  it('accepts Atlaskit query credentials only for trusted read requests', () => {
    const registry = createMediaSessionRegistry({
      apiBaseUrl: 'http://127.0.0.1:43125/api/media',
      allowedOrigin: origin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      randomBytes: () => new Uint8Array(32).fill(11),
      now: () => 1_000,
    });
    const auth = registry.issue({ localProfileId: profileId, noteId });
    const url = new URL(`${auth.baseUrl}/file/${noteId}/binary`);
    url.search = new URLSearchParams({
      client: auth.clientId,
      collection: auth.collection,
      token: auth.token,
    }).toString();

    expect(
      registry.authorize(
        new Request(url, { headers: { Origin: origin } }),
      ),
    ).toMatchObject({ noteId, collection: auth.collection });
    expect(() =>
      registry.authorize(
        new Request(url, {
          method: 'POST',
          headers: { Origin: origin },
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 401 }));
    expect(() =>
      registry.authorize(
        new Request(url, {
          headers: {
            Origin: origin,
            Authorization: `Bearer ${auth.token}`,
            'X-Client-Id': auth.clientId,
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ status: 401 }));
    url.searchParams.set('client', 'wrong-client');
    expect(() =>
      registry.authorize(
        new Request(url, { headers: { Origin: origin } }),
      ),
    ).toThrow(expect.objectContaining({ status: 401 }));
  });
});
