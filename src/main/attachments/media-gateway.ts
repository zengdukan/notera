import {
  ApplicationError,
  type AttachmentContentReader,
  type LocalAttachmentsService,
  type SessionState,
} from '@notera/application';

import type { SessionCommandGate } from '../ipc/local-notes-handlers';

const MEDIA_SCHEME = 'notera-media' as const;
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 5 * 60 * 1_000;

const controlledMimeTypes = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

interface MediaToken {
  readonly attachmentId: string;
  readonly localProfileId: string;
  readonly expiresAt: number;
}

interface ByteRange {
  readonly start: number;
  readonly endExclusive: number;
}

export interface MediaProtocolPort {
  handle(
    scheme: typeof MEDIA_SCHEME,
    handler: (request: Request) => Promise<Response>,
  ): void;
  unhandle(scheme: typeof MEDIA_SCHEME): void;
}

export interface MediaGateway {
  start(): void;
  issue(
    attachmentId: string,
  ): Promise<{ readonly url: string; readonly expiresAt: number }>;
  revokeAll(): void;
  close(): void;
}

function emptyResponse(status: number, length?: number): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (length !== undefined) {
    headers.set('Content-Range', `bytes */${length}`);
  }
  return new Response(null, { status, headers });
}

function safeInteger(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseRange(value: string, length: number): ByteRange | undefined {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (match === null || length <= 0) return undefined;
  const [, rawStart, rawEnd] = match;
  if (rawStart.length === 0) {
    const suffix = safeInteger(rawEnd);
    if (suffix === undefined || suffix <= 0 || suffix > length) {
      return undefined;
    }
    return { start: length - suffix, endExclusive: length };
  }

  const start = safeInteger(rawStart);
  if (start === undefined || start >= length) return undefined;
  if (rawEnd.length === 0) return { start, endExclusive: length };

  const end = safeInteger(rawEnd);
  if (end === undefined || end < start || end >= length) return undefined;
  return { start, endExclusive: end + 1 };
}

function tokenFromRequest(request: Request): string | undefined {
  try {
    const url = new URL(request.url);
    if (
      url.protocol !== `${MEDIA_SCHEME}:` ||
      url.hostname !== 'preview' ||
      url.username.length !== 0 ||
      url.password.length !== 0 ||
      url.port.length !== 0 ||
      url.search.length !== 0 ||
      url.hash.length !== 0
    ) {
      return undefined;
    }
    const parts = url.pathname.split('/');
    if (parts.length !== 2 || parts[0] !== '' || parts[1].length === 0) {
      return undefined;
    }
    return parts[1];
  } catch {
    return undefined;
  }
}

async function closeQuietly(reader: AttachmentContentReader): Promise<void> {
  await reader.close().catch(() => undefined);
}

function responseBody(
  reader: AttachmentContentReader,
  source: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await closeQuietly(reader);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) {
          controller.close();
          await close();
          return;
        }
        controller.enqueue(Uint8Array.from(result.value));
      } catch {
        controller.error(new Error('Media stream failed.'));
        await close();
      }
    },
    async cancel() {
      try {
        await iterator.return?.();
      } finally {
        await close();
      }
    },
  });
}

function sessionMatches(state: SessionState, token: MediaToken): boolean {
  return (
    state.state === 'UNLOCKED' && state.localProfileId === token.localProfileId
  );
}

function readerFailure(error: unknown): Response {
  if (error instanceof ApplicationError) {
    if (error.code === 'PROFILE_LOCKED') return emptyResponse(404);
    if (
      error.code === 'ENTITY_NOT_FOUND' ||
      error.code === 'BLOB_MISSING' ||
      error.code === 'BLOB_CORRUPT'
    ) {
      return emptyResponse(410);
    }
  }
  return emptyResponse(500);
}

export function createMediaGateway(input: {
  readonly protocol: MediaProtocolPort;
  readonly service: LocalAttachmentsService;
  readonly gate: SessionCommandGate;
  readonly getSessionState: () => SessionState;
  readonly randomBytes: () => Uint8Array;
  readonly now: () => number;
}): MediaGateway {
  const tokens = new Map<string, MediaToken>();
  let started = false;
  let closed = false;

  const handle = async (request: Request): Promise<Response> => {
    const tokenValue = tokenFromRequest(request);
    if (tokenValue === undefined) return emptyResponse(404);
    const token = tokens.get(tokenValue);
    if (token === undefined) return emptyResponse(404);
    if (input.now() >= token.expiresAt) {
      tokens.delete(tokenValue);
      return emptyResponse(404);
    }

    let state: SessionState;
    try {
      state = input.getSessionState();
    } catch {
      return emptyResponse(404);
    }
    if (!sessionMatches(state, token)) return emptyResponse(404);

    let reader: AttachmentContentReader;
    try {
      reader = await input.service.openReader(token.attachmentId as never);
    } catch (error) {
      return readerFailure(error);
    }

    let handedOff = false;
    try {
      const rangeHeader = request.headers.get('range');
      const range =
        rangeHeader === null
          ? null
          : parseRange(rangeHeader, reader.byteLength);
      if (rangeHeader !== null && range === undefined) {
        return emptyResponse(416, reader.byteLength);
      }

      const start = range?.start ?? 0;
      const endExclusive = range?.endExclusive ?? reader.byteLength;
      const source =
        range === null
          ? reader.stream()
          : reader.streamRange(start, endExclusive);
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Disposition': 'inline',
        'Content-Length': String(endExclusive - start),
        'Content-Type': controlledMimeTypes.has(reader.mimeType)
          ? reader.mimeType
          : 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      if (range !== null) {
        headers.set(
          'Content-Range',
          `bytes ${start}-${endExclusive - 1}/${reader.byteLength}`,
        );
      }
      const body = responseBody(reader, source);
      handedOff = true;
      return new Response(body, {
        status: range === null ? 200 : 206,
        headers,
      });
    } catch (error) {
      return readerFailure(error);
    } finally {
      if (!handedOff) await closeQuietly(reader);
    }
  };

  return Object.freeze({
    start(): void {
      if (started || closed) return;
      input.protocol.handle(MEDIA_SCHEME, handle);
      started = true;
    },

    issue(attachmentId: string) {
      if (closed) return Promise.reject(new ApplicationError('PROFILE_LOCKED'));
      return input.gate.run(async () => {
        const state = input.getSessionState();
        if (state.state !== 'UNLOCKED') {
          throw new ApplicationError('PROFILE_LOCKED');
        }
        const reader = await input.service.openReader(attachmentId as never);
        await closeQuietly(reader);

        let token: string;
        do {
          const random = input.randomBytes();
          if (random.byteLength !== TOKEN_BYTES) {
            throw new TypeError('Media tokens require 32 random bytes.');
          }
          token = Buffer.from(random).toString('base64url');
        } while (tokens.has(token));
        const expiresAt = input.now() + TOKEN_TTL_MS;
        tokens.set(token, {
          attachmentId,
          localProfileId: state.localProfileId,
          expiresAt,
        });
        return {
          url: `${MEDIA_SCHEME}://preview/${token}`,
          expiresAt,
        };
      });
    },

    revokeAll(): void {
      tokens.clear();
    },

    close(): void {
      if (closed) return;
      closed = true;
      tokens.clear();
      if (started) {
        input.protocol.unhandle(MEDIA_SCHEME);
        started = false;
      }
    },
  });
}
