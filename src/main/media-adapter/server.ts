/* eslint-disable no-await-in-loop, no-restricted-syntax */
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  AttachmentContentReader,
  AttachmentSummary,
  ImportAttachmentInput,
} from '@notera/application';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import { parseRangeHeader, RangeNotSatisfiableError } from './range';
import {
  createMediaSessionRegistry,
  MediaAuthorizationError,
  type MediaAuthorization,
  type MediaSessionRegistry,
} from './session-registry';

const HOST = '127.0.0.1';
const API_PATH = '/api/media';
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const allowedHeaders = new Set([
  'authorization',
  'content-type',
  'range',
  'x-b3-spanid',
  'x-b3-traceid',
  'x-client-id',
]);
const controlledMimeTypes = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);
const previewPlaceholder = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/AAAADAQABGN2NsQAAAABJRU5ErkJggg==',
  'base64',
);

interface SessionState {
  readonly state: string;
  readonly localProfileId?: string;
}

interface AttachmentsPort {
  importAttachment(input: ImportAttachmentInput): Promise<AttachmentSummary>;
  openReader(
    attachmentId: string,
    noteId?: string,
  ): Promise<AttachmentContentReader>;
}

interface NotesPort {
  getNote(noteId: string): Promise<unknown>;
}

interface EncryptedChunk {
  readonly ciphertext: readonly Buffer[];
  readonly tag: Buffer;
  readonly plaintextLength: number;
  readonly partNumber: string;
}

interface PendingUpload {
  readonly uploadId: string;
  readonly fileId: string;
  readonly noteId: string;
  readonly localProfileId: string;
  readonly collection: string;
  readonly expectedSize?: number;
  readonly key: Uint8Array;
  readonly chunks: Map<string, EncryptedChunk>;
  order: readonly string[];
}

export interface MediaAdapterServer {
  readonly apiBaseUrl: string;
  revokeProfile(localProfileId: string): void;
  revokeAll(): void;
  close(): Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function mediaType(mimeType: string): 'image' | 'video' | 'audio' | 'doc' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'doc';
}

function canServeImagePreview(mimeType: string): boolean {
  const type = mediaType(mimeType);
  return type === 'image' || type === 'video';
}

function fileData(value: {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteLength: number;
}) {
  const type = mediaType(value.mimeType);
  return {
    id: value.id,
    name: value.fileName,
    size: value.byteLength,
    mimeType: value.mimeType,
    mediaType: type,
    processingStatus: 'succeeded',
    representations: canServeImagePreview(value.mimeType) ? { image: {} } : {},
    artifacts: {},
  };
}

function blank(response: Response, status: number): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.status(status).end();
}

function sourceOrigin(request: Request): string | undefined {
  const origin = request.get('origin');
  if (origin !== undefined) return origin;
  const referer = request.get('referer');
  if (referer === undefined) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function requestFor(request: Request): globalThis.Request {
  const headers = new Headers();
  const origin = sourceOrigin(request);
  if (origin !== undefined) headers.set('origin', origin);
  ['authorization', 'x-client-id'].forEach((name) => {
    const value = request.get(name);
    if (value !== undefined) headers.set(name, value);
  });
  return new globalThis.Request(
    `http://${request.get('host') ?? HOST}${request.originalUrl}`,
    { method: request.method, headers },
  );
}

function requireCollection(
  value: unknown,
  authorization: MediaAuthorization,
): void {
  if (text(value) !== authorization.collection) {
    throw new MediaAuthorizationError(404);
  }
}

function encryptionIv(
  upload: PendingUpload,
  etag: string,
  partNumber: string,
): Buffer {
  return createHash('sha256')
    .update(`${upload.uploadId}\u0000${partNumber}\u0000${etag}`)
    .digest()
    .subarray(0, 12);
}

async function encryptRequest(
  request: Request,
  upload: PendingUpload,
  etag: string,
  partNumber: string,
  signal: AbortSignal,
): Promise<EncryptedChunk> {
  const cipher = createCipheriv(
    'aes-256-gcm',
    upload.key,
    encryptionIv(upload, etag, partNumber),
  );
  const ciphertext: Buffer[] = [];
  let plaintextLength = 0;
  for await (const raw of request) {
    if (signal.aborted) throw new MediaAuthorizationError();
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
    plaintextLength += chunk.byteLength;
    if (plaintextLength > MAX_FILE_BYTES)
      throw new RangeError('upload too large');
    const encrypted = cipher.update(chunk);
    if (encrypted.byteLength > 0) ciphertext.push(encrypted);
  }
  const final = cipher.final();
  if (final.byteLength > 0) ciphertext.push(final);
  return Object.freeze({
    ciphertext: Object.freeze(ciphertext),
    tag: cipher.getAuthTag(),
    plaintextLength,
    partNumber,
  });
}

async function* decryptUpload(
  upload: PendingUpload,
): AsyncIterable<Uint8Array> {
  for (const etag of upload.order) {
    const value = upload.chunks.get(etag);
    if (value === undefined) throw new Error('missing encrypted chunk');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      upload.key,
      encryptionIv(upload, etag, value.partNumber),
    );
    decipher.setAuthTag(value.tag);
    for (const ciphertext of value.ciphertext) {
      const plaintext = decipher.update(ciphertext);
      if (plaintext.byteLength > 0) yield plaintext;
    }
    const final = decipher.final();
    if (final.byteLength > 0) yield final;
  }
}

function wipeUpload(upload: PendingUpload): void {
  upload.key.fill(0);
  upload.chunks.clear();
  upload.order = Object.freeze([]);
}

export async function startMediaAdapterServer(input: {
  readonly allowedOrigin: string;
  readonly getSessionState: () => SessionState;
  readonly notes: NotesPort;
  readonly attachments: AttachmentsPort;
  readonly randomBytes: () => Uint8Array;
  readonly randomUUID: () => string;
  readonly now: () => number;
}): Promise<MediaAdapterServer> {
  const app = express();
  app.disable('x-powered-by');
  const uploads = new Map<string, PendingUpload>();
  let registry: MediaSessionRegistry;

  app.use((request, response, next) => {
    const origin = sourceOrigin(request);
    if (origin !== input.allowedOrigin) {
      blank(response, 401);
      return;
    }
    const requested = (request.get('access-control-request-headers') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (requested.some((value) => !allowedHeaders.has(value))) {
      blank(response, 401);
      return;
    }
    response.vary('Origin');
    response.set({
      'Access-Control-Allow-Origin': input.allowedOrigin,
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, Range, X-B3-SpanId, X-B3-TraceId, X-Client-Id',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
      'Access-Control-Expose-Headers':
        'Content-Length, Content-Range, Accept-Ranges',
    });
    if (request.method === 'OPTIONS') response.sendStatus(204);
    else next();
  });

  const json = express.json({ limit: '2mb' });
  const authorize = (request: Request) =>
    registry.authorize(requestFor(request));

  app.post(`${API_PATH}/auth`, json, async (request, response) => {
    try {
      const body = record(request.body);
      const noteId = text(body.noteId);
      if (!UUID.test(noteId)) throw new MediaAuthorizationError();
      const state = input.getSessionState();
      if (state.state !== 'UNLOCKED' || state.localProfileId === undefined) {
        throw new MediaAuthorizationError();
      }
      await input.notes.getNote(noteId);
      const auth = registry.issue({
        localProfileId: state.localProfileId,
        noteId,
      });
      response.json(auth);
    } catch {
      blank(response, 401);
    }
  });

  app.post(`${API_PATH}/upload/createWithFiles`, json, (request, response) => {
    try {
      const auth = authorize(request);
      const created: Array<{ fileId: string; uploadId: string }> = [];
      const rejected: unknown[] = [];
      for (const raw of array(record(request.body).descriptors)) {
        const descriptor = record(raw);
        const descriptorCollection =
          text(descriptor.collection) || auth.collection;
        requireCollection(descriptorCollection, auth);
        const candidateId = text(descriptor.fileId);
        const { size } = descriptor;
        if (
          !UUID.test(candidateId) ||
          (size !== undefined &&
            (!Number.isSafeInteger(size) ||
              Number(size) < 0 ||
              Number(size) > MAX_FILE_BYTES))
        ) {
          rejected.push({ fileId: candidateId });
          continue;
        }
        const uploadId = input.randomUUID();
        const key = input.randomBytes();
        if (!UUID.test(uploadId) || key.byteLength !== 32) {
          throw new TypeError('Invalid secure upload identifiers.');
        }
        uploads.set(uploadId, {
          uploadId,
          fileId: candidateId,
          noteId: auth.noteId,
          localProfileId: auth.localProfileId,
          collection: auth.collection,
          ...(size === undefined ? {} : { expectedSize: Number(size) }),
          key: Uint8Array.from(key),
          chunks: new Map(),
          order: Object.freeze([]),
        });
        created.push({ fileId: candidateId, uploadId });
      }
      response.status(201).json({
        data: { created, ...(rejected.length === 0 ? {} : { rejected }) },
      });
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 400,
      );
    }
  });

  app.post(`${API_PATH}/file/binary`, async (request, response) => {
    try {
      const auth = authorize(request);
      requireCollection(request.query.collection, auth);
      const attachmentId = input.randomUUID();
      if (!UUID.test(attachmentId))
        throw new TypeError('Invalid Media file ID.');
      const fileName = text(request.query.name) || 'file';
      const mimeType =
        request.get('content-type') || 'application/octet-stream';
      const source = (async function* requestBody() {
        for await (const raw of request) {
          yield Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
        }
      })();
      const imported = await input.attachments.importAttachment({
        attachmentId: attachmentId as never,
        noteId: auth.noteId as never,
        reference: {
          kind: 'UPLOAD',
          expiresAt: (input.now() + UPLOAD_TTL_MS) as never,
        },
        fileName,
        mimeType,
        source,
        signal: auth.signal,
      });
      response.status(201).json({
        data: fileData({
          id: String(imported.id),
          fileName: imported.fileName,
          mimeType: imported.mime,
          byteLength: imported.byteLength,
        }),
      });
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 500,
      );
    }
  });

  app.put(`${API_PATH}/chunk/:etag`, async (request, response) => {
    try {
      const auth = authorize(request);
      const upload = uploads.get(text(request.query.uploadId));
      const etag = text(request.params.etag);
      const partNumber = text(request.query.partNumber);
      if (
        upload === undefined ||
        upload.noteId !== auth.noteId ||
        upload.collection !== auth.collection ||
        etag.length === 0 ||
        !/^\d+$/u.test(partNumber) ||
        upload.chunks.has(etag)
      ) {
        throw new MediaAuthorizationError(404);
      }
      const chunk = await encryptRequest(
        request,
        upload,
        etag,
        partNumber,
        auth.signal,
      );
      const currentBytes = [...upload.chunks.values()].reduce(
        (sum, value) => sum + value.plaintextLength,
        chunk.plaintextLength,
      );
      if (currentBytes > MAX_FILE_BYTES)
        throw new RangeError('upload too large');
      upload.chunks.set(etag, chunk);
      response.sendStatus(201);
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 413,
      );
    }
  });

  app.put(`${API_PATH}/upload/:uploadId/chunks`, json, (request, response) => {
    try {
      const auth = authorize(request);
      const upload = uploads.get(text(request.params.uploadId));
      const body = record(request.body);
      const chunks = array(body.chunks).map(text);
      const offset =
        body.offset === undefined ? upload?.order.length : Number(body.offset);
      if (
        upload === undefined ||
        upload.noteId !== auth.noteId ||
        offset !== upload.order.length ||
        chunks.some((etag) => !upload.chunks.has(etag))
      ) {
        throw new MediaAuthorizationError(404);
      }
      upload.order = Object.freeze([...upload.order, ...chunks]);
      response.sendStatus(200);
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 400,
      );
    }
  });

  app.post(`${API_PATH}/file/upload`, json, async (request, response) => {
    let upload: PendingUpload | undefined;
    try {
      const auth = authorize(request);
      const body = record(request.body);
      upload = uploads.get(text(body.uploadId));
      const replacementId = text(request.query.replaceFileId);
      requireCollection(request.query.collection, auth);
      if (
        upload === undefined ||
        upload.noteId !== auth.noteId ||
        upload.collection !== auth.collection ||
        upload.fileId !== replacementId ||
        upload.order.length !== upload.chunks.size
      ) {
        throw new MediaAuthorizationError(404);
      }
      const byteLength = upload.order.reduce(
        (sum, etag) => sum + (upload?.chunks.get(etag)?.plaintextLength ?? 0),
        0,
      );
      const conditionSize = record(body.conditions).size;
      if (
        byteLength > MAX_FILE_BYTES ||
        (upload.expectedSize !== undefined &&
          upload.expectedSize !== byteLength) ||
        (conditionSize !== undefined && Number(conditionSize) !== byteLength)
      ) {
        throw new RangeError('upload size mismatch');
      }
      const fileName = text(body.name) || 'file';
      const mimeType = text(body.mimeType) || 'application/octet-stream';
      const imported = await input.attachments.importAttachment({
        attachmentId: upload.fileId as never,
        noteId: upload.noteId as never,
        reference: {
          kind: 'UPLOAD',
          expiresAt: (input.now() + UPLOAD_TTL_MS) as never,
        },
        fileName,
        mimeType,
        source: decryptUpload(upload),
        signal: auth.signal,
      });
      response.json({
        data: fileData({
          id: String(imported.id),
          fileName: imported.fileName,
          mimeType: imported.mime,
          byteLength: imported.byteLength,
        }),
      });
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError
          ? error.status
          : error instanceof RangeError
            ? 413
            : 500,
      );
    } finally {
      if (upload !== undefined) {
        uploads.delete(upload.uploadId);
        wipeUpload(upload);
      }
    }
  });

  const openScoped = async (request: Request, auth: MediaAuthorization) => {
    const fileId = text(request.params.fileId);
    if (!UUID.test(fileId)) throw new MediaAuthorizationError(404);
    requireCollection(request.query.collection, auth);
    return input.attachments.openReader(fileId, auth.noteId);
  };

  const sendBinary = async (request: Request, response: Response) => {
    let reader: AttachmentContentReader | undefined;
    let auth: MediaAuthorization | undefined;
    const abort = () => response.destroy();
    try {
      auth = authorize(request);
      reader = await openScoped(request, auth);
      let range;
      try {
        range = parseRangeHeader(request.get('range'), reader.byteLength);
      } catch (error) {
        if (error instanceof RangeNotSatisfiableError) {
          response.set('Content-Range', `bytes */${reader.byteLength}`);
          blank(response, 416);
          return;
        }
        throw error;
      }
      const start = range?.start ?? 0;
      const endExclusive = range?.endExclusive ?? reader.byteLength;
      response.status(range === undefined ? 200 : 206).set({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Content-Length': String(endExclusive - start),
        'Content-Type': controlledMimeTypes.has(reader.mimeType)
          ? reader.mimeType
          : 'application/octet-stream',
        ...(text(request.query.dl) === 'true'
          ? { 'Content-Disposition': 'attachment' }
          : {}),
        'X-Content-Type-Options': 'nosniff',
        ...(range === undefined
          ? {}
          : {
              'Content-Range': `bytes ${start}-${endExclusive - 1}/${reader.byteLength}`,
            }),
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      auth.signal.addEventListener('abort', abort, { once: true });
      const source =
        range === undefined
          ? reader.stream()
          : reader.streamRange(start, endExclusive);
      for await (const chunk of source) {
        if (!response.write(Buffer.from(chunk))) {
          await new Promise<void>((resolve) => response.once('drain', resolve));
        }
      }
      response.end();
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 404,
      );
    } finally {
      auth?.signal.removeEventListener('abort', abort);
      await reader?.close().catch(() => undefined);
    }
  };

  const sendImage = async (request: Request, response: Response) => {
    let reader: AttachmentContentReader | undefined;
    let auth: MediaAuthorization | undefined;
    const abort = () => response.destroy();
    try {
      auth = authorize(request);
      reader = await openScoped(request, auth);
      const type = mediaType(reader.mimeType);
      if (!canServeImagePreview(reader.mimeType)) {
        blank(response, 404);
        return;
      }

      const servesOriginalImage =
        type === 'image' && controlledMimeTypes.has(reader.mimeType);
      const body = servesOriginalImage ? undefined : previewPlaceholder;
      response.status(200).set({
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(body?.byteLength ?? reader.byteLength),
        'Content-Type': servesOriginalImage ? reader.mimeType : 'image/png',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      if (body !== undefined) {
        response.end(body);
        return;
      }

      auth.signal.addEventListener('abort', abort, { once: true });
      for await (const chunk of reader.stream()) {
        if (!response.write(Buffer.from(chunk))) {
          await new Promise<void>((resolve) => response.once('drain', resolve));
        }
      }
      response.end();
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 404,
      );
    } finally {
      auth?.signal.removeEventListener('abort', abort);
      await reader?.close().catch(() => undefined);
    }
  };

  for (const suffix of ['binary', 'binary/cdn']) {
    app.get(`${API_PATH}/file/:fileId/${suffix}`, (request, response) => {
      void sendBinary(request, response);
    });
    app.head(`${API_PATH}/file/:fileId/${suffix}`, (request, response) => {
      void sendBinary(request, response);
    });
  }

  for (const suffix of ['image', 'image/cdn']) {
    app.get(`${API_PATH}/file/:fileId/${suffix}`, (request, response) => {
      void sendImage(request, response);
    });
    app.head(`${API_PATH}/file/:fileId/${suffix}`, (request, response) => {
      void sendImage(request, response);
    });
  }

  app.get(`${API_PATH}/file/:fileId`, async (request, response) => {
    let reader: AttachmentContentReader | undefined;
    try {
      const auth = authorize(request);
      reader = await openScoped(request, auth);
      response.json({
        data: fileData({
          id: String(reader.attachmentId),
          fileName: reader.fileName,
          mimeType: reader.mimeType,
          byteLength: reader.byteLength,
        }),
      });
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 404,
      );
    } finally {
      await reader?.close().catch(() => undefined);
    }
  });

  app.post(`${API_PATH}/items`, json, async (request, response) => {
    const readers: AttachmentContentReader[] = [];
    try {
      const auth = authorize(request);
      const items = [];
      for (const raw of array(record(request.body).descriptors)) {
        const descriptor = record(raw);
        requireCollection(descriptor.collection, auth);
        try {
          const reader = await input.attachments.openReader(
            text(descriptor.id),
            auth.noteId,
          );
          readers.push(reader);
          items.push({
            type: 'file',
            id: String(reader.attachmentId),
            collection: auth.collection,
            details: fileData({
              id: String(reader.attachmentId),
              fileName: reader.fileName,
              mimeType: reader.mimeType,
              byteLength: reader.byteLength,
            }),
          });
        } catch {
          // Missing Media items are omitted so other document content still renders.
        }
      }
      response.json({ data: { items } });
    } catch (error) {
      blank(
        response,
        error instanceof MediaAuthorizationError ? error.status : 401,
      );
    } finally {
      await Promise.all(
        readers.map((reader) => reader.close().catch(() => undefined)),
      );
    }
  });

  app.get(
    `${API_PATH}/file/:fileId/image/metadata`,
    async (request, response) => {
      let reader: AttachmentContentReader | undefined;
      try {
        const auth = authorize(request);
        reader = await openScoped(request, auth);
        if (!canServeImagePreview(reader.mimeType)) {
          blank(response, 404);
          return;
        }
        response.json({
          metadata: {
            pending: false,
            preview: {},
            original: { width: 1, height: 1 },
          },
        });
      } catch (error) {
        blank(
          response,
          error instanceof MediaAuthorizationError ? error.status : 404,
        );
      } finally {
        await reader?.close().catch(() => undefined);
      }
    },
  );

  app.use(
    (
      _error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      blank(response, 500);
    },
  );

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(0, HOST, () => {
      candidate.removeListener('error', reject);
      resolve(candidate);
    });
    candidate.once('error', reject);
  });
  const address = httpServer.address() as AddressInfo | null;
  if (address === null || address.address !== HOST) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    throw new Error('Media Adapter must bind loopback.');
  }
  const apiBaseUrl = `http://${HOST}:${address.port}${API_PATH}`;
  registry = createMediaSessionRegistry({
    apiBaseUrl,
    allowedOrigin: input.allowedOrigin,
    getSessionState: input.getSessionState,
    randomBytes: input.randomBytes,
    now: input.now,
  });
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    apiBaseUrl,
    revokeProfile(localProfileId: string) {
      registry.revokeProfile(localProfileId);
      uploads.forEach((upload, uploadId) => {
        if (upload.localProfileId !== localProfileId) return;
        wipeUpload(upload);
        uploads.delete(uploadId);
      });
    },
    revokeAll() {
      registry.revokeAll();
      uploads.forEach(wipeUpload);
      uploads.clear();
    },
    close() {
      if (closePromise !== undefined) return closePromise;
      registry.revokeAll();
      uploads.forEach(wipeUpload);
      uploads.clear();
      closePromise = new Promise<void>((resolve, reject) => {
        httpServer.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
        httpServer.closeIdleConnections?.();
      });
      return closePromise;
    },
  });
}
