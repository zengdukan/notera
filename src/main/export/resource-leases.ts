/* eslint-disable no-restricted-syntax */
import {
  ApplicationError,
  type AttachmentContentReader,
  type LocalAttachmentsService,
  type SessionState,
} from '@notera/application';

import type { PdfRenderAsset } from './types';

const SCHEME = 'notera-export-media' as const;
const controlledMimeTypes = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

export interface ExportResourceProtocolPort {
  handle(
    scheme: typeof SCHEME,
    handler: (request: Request) => Promise<Response>,
  ): void;
  unhandle(scheme: typeof SCHEME): void;
}

export interface ExportResourceLease {
  readonly baseUrl: string;
  start(): void;
  close(): void;
}

interface ByteRange {
  readonly start: number;
  readonly endExclusive: number;
}

function response(
  status: number,
  body?: BodyInit | null,
  headers?: HeadersInit,
) {
  return new Response(body ?? null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
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
    if (suffix === undefined || suffix <= 0 || suffix > length)
      return undefined;
    return { start: length - suffix, endExclusive: length };
  }
  const start = safeInteger(rawStart);
  if (start === undefined || start >= length) return undefined;
  if (rawEnd.length === 0) return { start, endExclusive: length };
  const end = safeInteger(rawEnd);
  if (end === undefined || end < start || end >= length) return undefined;
  return { start, endExclusive: end + 1 };
}

async function closeQuietly(reader: AttachmentContentReader) {
  await reader.close().catch(() => undefined);
}

function streamBody(input: {
  reader: AttachmentContentReader;
  source: AsyncIterable<Uint8Array>;
  onChunk: (length: number) => void;
}): ReadableStream<Uint8Array> {
  const iterator = input.source[Symbol.asyncIterator]();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await closeQuietly(input.reader);
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          await close();
          return;
        }
        const bytes = Uint8Array.from(next.value);
        input.onChunk(bytes.byteLength);
        controller.enqueue(bytes);
      } catch {
        controller.error(new Error('Export resource stream failed.'));
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

function item(asset: PdfRenderAsset) {
  return {
    id: asset.id,
    type: 'file',
    details: {
      name: asset.fileName,
      mimeType: asset.mimeType,
      size: asset.byteLength,
      processingStatus: 'succeeded',
      artifacts: {},
    },
  };
}

function sessionMatches(state: SessionState, profileId: string): boolean {
  return state.state === 'UNLOCKED' && state.localProfileId === profileId;
}

export function createExportResourceLease(input: {
  readonly protocol: ExportResourceProtocolPort;
  readonly service: LocalAttachmentsService;
  readonly getSessionState: () => SessionState;
  readonly expectedProfileId: string;
  readonly operationId: string;
  readonly token: string;
  readonly expiresAt: number;
  readonly now: () => number;
  readonly assets: readonly PdfRenderAsset[];
  readonly signal: AbortSignal;
  readonly onBytes: (completed: number) => void;
}): ExportResourceLease {
  const assets = new Map(input.assets.map((asset) => [asset.id, asset]));
  const baseUrl = `${SCHEME}://${input.operationId}/${input.token}`;
  let started = false;
  let closed = false;
  let completed = 0;

  const authorize = (request: Request) => {
    if (closed || input.signal.aborted || input.now() >= input.expiresAt) {
      return undefined;
    }
    let state: SessionState;
    try {
      state = input.getSessionState();
    } catch {
      return undefined;
    }
    if (!sessionMatches(state, input.expectedProfileId)) return undefined;
    try {
      const url = new URL(request.url);
      if (
        url.protocol !== `${SCHEME}:` ||
        url.hostname !== input.operationId ||
        url.username ||
        url.password ||
        url.port ||
        url.hash
      ) {
        return undefined;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.shift() !== input.token) return undefined;
      return { url, parts };
    } catch {
      return undefined;
    }
  };

  const handle = async (request: Request): Promise<Response> => {
    const authorized = authorize(request);
    if (authorized === undefined) return response(404);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response(405, null, { Allow: 'GET, HEAD' });
    }
    const { parts, url } = authorized;
    if (parts.length === 1 && parts[0] === 'items') {
      const ids = (url.searchParams.get('ids') ?? '')
        .split(',')
        .filter(Boolean);
      if (ids.length === 0 || ids.some((id) => !assets.has(id))) {
        return response(404);
      }
      return response(
        200,
        request.method === 'HEAD'
          ? null
          : JSON.stringify({
              data: { items: ids.map((id) => item(assets.get(id)!)) },
            }),
        { 'Content-Type': 'application/json' },
      );
    }
    if (parts[0] !== 'file' || parts.length < 2) return response(404);
    const asset = assets.get(parts[1]);
    if (asset === undefined) return response(404);
    if (
      parts.length === 2 ||
      (parts.length === 4 && parts[2] === 'image' && parts[3] === 'metadata')
    ) {
      const data =
        parts.length === 2 ? { data: item(asset) } : { width: 0, height: 0 };
      return response(
        200,
        request.method === 'HEAD' ? null : JSON.stringify(data),
        { 'Content-Type': 'application/json' },
      );
    }
    if (parts.length !== 3 || (parts[2] !== 'binary' && parts[2] !== 'image')) {
      return response(404);
    }

    let reader: AttachmentContentReader;
    try {
      reader = await input.service.openReader(asset.id as never);
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        [
          'PROFILE_LOCKED',
          'ENTITY_NOT_FOUND',
          'BLOB_MISSING',
          'BLOB_CORRUPT',
        ].includes(error.code)
      ) {
        return response(410);
      }
      return response(500);
    }
    let handedOff = false;
    try {
      const rawRange = request.headers.get('range');
      const range =
        rawRange === null ? null : parseRange(rawRange, reader.byteLength);
      if (rawRange !== null && range === undefined) {
        return response(416, null, {
          'Content-Range': `bytes */${reader.byteLength}`,
        });
      }
      const start = range?.start ?? 0;
      const endExclusive = range?.endExclusive ?? reader.byteLength;
      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline',
        'Content-Length': String(endExclusive - start),
        'Content-Type': controlledMimeTypes.has(reader.mimeType)
          ? reader.mimeType
          : 'application/octet-stream',
      };
      if (range !== null) {
        headers['Content-Range'] =
          `bytes ${start}-${endExclusive - 1}/${reader.byteLength}`;
      }
      if (request.method === 'HEAD') return response(200, null, headers);
      const source =
        range === null
          ? reader.stream()
          : reader.streamRange(start, endExclusive);
      const body = streamBody({
        reader,
        source,
        onChunk(length) {
          completed += length;
          input.onBytes(completed);
        },
      });
      handedOff = true;
      return response(range === null ? 200 : 206, body, headers);
    } finally {
      if (!handedOff) await closeQuietly(reader);
    }
  };

  return Object.freeze({
    baseUrl,
    start() {
      if (started || closed) return;
      input.protocol.handle(SCHEME, handle);
      started = true;
    },
    close() {
      if (closed) return;
      closed = true;
      if (started) input.protocol.unhandle(SCHEME);
      started = false;
    },
  });
}
