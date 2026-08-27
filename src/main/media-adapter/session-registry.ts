import { mediaCollectionForNote } from '../../shared/atlassian-editor/media-runtime';

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 5 * 60 * 1_000;
const CLIENT_ID = 'notera-local-media';

interface SessionState {
  readonly state: string;
  readonly localProfileId?: string;
}

interface SessionToken {
  readonly token: string;
  readonly localProfileId: string;
  readonly noteId: string;
  readonly collection: string;
  readonly expiresAt: number;
  readonly controller: AbortController;
}

export interface MediaAuth {
  readonly token: string;
  readonly clientId: string;
  readonly baseUrl: string;
  readonly collection: string;
  readonly expiresAt: number;
}

export interface MediaAuthorization {
  readonly localProfileId: string;
  readonly noteId: string;
  readonly collection: string;
  readonly signal: AbortSignal;
}

export class MediaAuthorizationError extends Error {
  constructor(readonly status: 401 | 404 = 401) {
    super('Media request rejected.');
    this.name = 'MediaAuthorizationError';
  }
}

export interface MediaSessionRegistry {
  issue(input: {
    readonly localProfileId: string;
    readonly noteId: string;
  }): MediaAuth;
  authorize(request: Request): MediaAuthorization;
  revokeProfile(localProfileId: string): void;
  revokeAll(): void;
}

export function createMediaSessionRegistry(input: {
  readonly apiBaseUrl: string;
  readonly allowedOrigin: string;
  readonly getSessionState: () => SessionState;
  readonly randomBytes: () => Uint8Array;
  readonly now: () => number;
}): MediaSessionRegistry {
  const tokens = new Map<string, SessionToken>();

  const reject = (): never => {
    throw new MediaAuthorizationError();
  };

  const registry: MediaSessionRegistry = {
    issue(scope: { readonly localProfileId: string; readonly noteId: string }) {
      const state = input.getSessionState();
      if (
        state.state !== 'UNLOCKED' ||
        state.localProfileId !== scope.localProfileId
      ) {
        return reject();
      }
      let token: string;
      do {
        const random = input.randomBytes();
        if (random.byteLength !== TOKEN_BYTES) {
          throw new TypeError('Media tokens require 32 random bytes.');
        }
        token = Buffer.from(random).toString('base64url');
      } while (tokens.has(token));
      const value: SessionToken = {
        token,
        localProfileId: scope.localProfileId,
        noteId: scope.noteId,
        collection: mediaCollectionForNote(scope.noteId),
        expiresAt: input.now() + TOKEN_TTL_MS,
        controller: new AbortController(),
      };
      tokens.set(token, value);
      return Object.freeze({
        token,
        clientId: CLIENT_ID,
        baseUrl: input.apiBaseUrl,
        collection: value.collection,
        expiresAt: value.expiresAt,
      });
    },

    authorize(request: Request) {
      if (request.headers.get('Origin') !== input.allowedOrigin)
        return reject();
      const authorization = request.headers.get('Authorization');
      const tokenValue = authorization?.match(
        /^Bearer ([A-Za-z0-9_-]+)$/u,
      )?.[1];
      if (
        tokenValue === undefined ||
        request.headers.get('X-Client-Id') !== CLIENT_ID
      ) {
        return reject();
      }
      const token = tokens.get(tokenValue);
      if (token === undefined) return reject();
      const state = input.getSessionState();
      if (
        input.now() >= token.expiresAt ||
        state.state !== 'UNLOCKED' ||
        state.localProfileId !== token.localProfileId
      ) {
        token.controller.abort();
        tokens.delete(tokenValue);
        return reject();
      }
      return Object.freeze({
        localProfileId: token.localProfileId,
        noteId: token.noteId,
        collection: token.collection,
        signal: token.controller.signal,
      });
    },

    revokeProfile(localProfileId: string) {
      tokens.forEach((token, value) => {
        if (token.localProfileId !== localProfileId) return;
        token.controller.abort();
        tokens.delete(value);
      });
    },

    revokeAll() {
      tokens.forEach(({ controller }) => controller.abort());
      tokens.clear();
    },
  };
  return Object.freeze(registry);
}
