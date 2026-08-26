import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import {
  createDemoMediaServerConfig,
  type DemoMediaServerOptions,
} from './config';
import { MediaStore, mediaTypeFor, type MediaFileRecord } from './store';

const previewPlaceholder = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNg+M/AAAADAQABGN2NsQAAAABJRU5ErkJggg==',
  'base64',
);

export interface DemoMediaServer {
  readonly apiBaseUrl: string;
  close(): Promise<void>;
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function canServeImagePreview(file: MediaFileRecord): boolean {
  const mediaType =
    mediaTypeFor(file.details.mimeType) || file.details.mediaType;
  return mediaType === 'image' || mediaType === 'video';
}

function fileDetails(file: MediaFileRecord) {
  const mediaType =
    mediaTypeFor(file.details.mimeType) || file.details.mediaType;
  return {
    ...file.details,
    mediaType,
    representations: canServeImagePreview(file)
      ? file.details.representations
      : {},
  };
}

function fileData(file: MediaFileRecord) {
  return { id: file.id, ...fileDetails(file) };
}

export async function startDemoMediaServer(
  options: DemoMediaServerOptions,
): Promise<DemoMediaServer> {
  const config = createDemoMediaServerConfig(options);
  const store = new MediaStore(config.dataRoot);
  await store.initialize();

  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const requestedHeaders = request.get('Access-Control-Request-Headers');
    response.vary('Origin');
    response.vary('Access-Control-Request-Headers');
    response.set({
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Headers':
        requestedHeaders && requestedHeaders.trim().length > 0
          ? requestedHeaders
          : 'Authorization, Content-Type, Range, X-Client-Id',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Expose-Headers':
        'Content-Length, Content-Range, Content-Disposition',
    });
    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }
    next();
  });

  const json = express.json({ limit: '2mb' });
  const raw = express.raw({ type: () => true, limit: config.maxFileSize });

  const publicBaseUrl = (request: Request): string => {
    if (config.publicBaseUrl !== undefined) return config.publicBaseUrl;
    const protocol = textValue(
      request.headers['x-forwarded-proto'],
      request.protocol,
    );
    const host = textValue(
      request.headers['x-forwarded-host'],
      request.headers.host,
    );
    return `${protocol}://${host}${config.apiPath}`;
  };

  const findFile = (
    request: Request,
    response: Response,
  ): MediaFileRecord | undefined => {
    const file = store.getFile(
      textValue(request.params.fileId),
      textValue(request.query.collection) || undefined,
    );
    if (file === undefined) {
      response.status(404).json({ error: 'File not found' });
    }
    return file;
  };

  app.get(`${config.apiPath}/health`, (_request, response) => {
    response.json({ ok: true });
  });
  app.post(`${config.apiPath}/auth`, json, (request, response) => {
    response.json({
      token: 'local-media-service',
      clientId: 'local-atlaskit-editor',
      baseUrl: publicBaseUrl(request),
    });
  });

  app.post(
    `${config.apiPath}/upload/createWithFiles`,
    json,
    async (request, response) => {
      const body = recordValue(request.body);
      const created: Array<{ fileId: string; uploadId: string }> = [];
      for (const rawDescriptor of arrayValue(body.descriptors)) {
        const descriptor = recordValue(rawDescriptor);
        const fileId = textValue(descriptor.fileId);
        await store.createPlaceholder({
          id: fileId,
          collection: textValue(descriptor.collection),
          occurrenceKey: textValue(descriptor.occurrenceKey) || undefined,
        });
        created.push({ fileId, uploadId: store.createUpload().id });
      }
      response.json({ data: { created } });
    },
  );

  app.post(`${config.apiPath}/upload`, (request, response) => {
    const requestedCount = Number(request.query.createUpTo) || 1;
    const count = Math.max(1, Math.min(requestedCount, 20));
    response.json({
      data: Array.from({ length: count }, () => store.createUpload()),
    });
  });

  app.head(`${config.apiPath}/chunk/:chunkId`, async (request, response) => {
    response.sendStatus(
      (await store.hasChunk(textValue(request.params.chunkId))) ? 200 : 404,
    );
  });
  app.put(
    `${config.apiPath}/chunk/:chunkId`,
    raw,
    async (request, response) => {
      await store.putChunk(
        textValue(request.params.chunkId),
        Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      );
      response.sendStatus(201);
    },
  );
  app.put(
    `${config.apiPath}/upload/:uploadId/chunks`,
    json,
    (request, response) => {
      const body = recordValue(request.body);
      const chunks = arrayValue(body.chunks).map((chunk) => textValue(chunk));
      response.sendStatus(
        store.appendUploadChunks(textValue(request.params.uploadId), chunks)
          ? 200
          : 404,
      );
    },
  );

  app.post(`${config.apiPath}/file/upload`, json, async (request, response) => {
    const body = recordValue(request.body);
    const file = await store.finalizeUpload({
      uploadId: textValue(body.uploadId),
      fileId: textValue(request.query.replaceFileId),
      collection: textValue(request.query.collection),
      name: textValue(body.name, 'file'),
      mimeType: textValue(body.mimeType, 'application/octet-stream'),
    });
    if (file === undefined) {
      response.status(404).json({ error: 'Upload or file not found' });
      return;
    }
    response.json({ data: fileData(file) });
  });

  app.post(`${config.apiPath}/file/binary`, raw, async (request, response) => {
    const file = await store.createBinary({
      buffer: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      collection: textValue(request.query.collection),
      occurrenceKey: textValue(request.query.occurrenceKey) || undefined,
      name: textValue(request.query.name, 'file'),
      mimeType: textValue(
        request.headers['content-type'],
        'application/octet-stream',
      ),
    });
    response.status(201).json({ data: fileData(file) });
  });

  app.get(`${config.apiPath}/file/:fileId`, (request, response) => {
    const file = findFile(request, response);
    if (file !== undefined) response.json({ data: fileData(file) });
  });
  app.post(`${config.apiPath}/items`, json, (request, response) => {
    const body = recordValue(request.body);
    const items = arrayValue(body.descriptors).flatMap((rawDescriptor) => {
      const descriptor = recordValue(rawDescriptor);
      const file = store.getFile(
        textValue(descriptor.id),
        textValue(descriptor.collection) || undefined,
      );
      return file === undefined
        ? []
        : [
            {
              type: 'file',
              id: file.id,
              collection: file.collection,
              details: fileDetails(file),
            },
          ];
    });
    response.json({ data: { items } });
  });

  const sendBinary = async (
    request: Request,
    response: Response,
    input: { readonly download?: boolean } = {},
  ): Promise<void> => {
    const file = findFile(request, response);
    if (file === undefined) return;
    const { size } = await store.binaryStat(file.id);
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/u);
    const name = textValue(
      request.query.name,
      file.details.name || 'download',
    ).replace(/["\r\n]/gu, '_');
    response.set({
      'Accept-Ranges': 'bytes',
      'Content-Type': file.details.mimeType || 'application/octet-stream',
      ...(input.download === true || request.query.dl === 'true'
        ? {
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
              name,
            )}`,
          }
        : {}),
    });
    if (range !== undefined && range !== null) {
      const isSuffixRange = range[1] === '' && range[2] !== '';
      const start = isSuffixRange
        ? Math.max(size - Number(range[2]), 0)
        : Number(range[1] || 0);
      const end = isSuffixRange
        ? size - 1
        : range[2]
          ? Math.min(Number(range[2]), size - 1)
          : size - 1;
      if (start > end || start >= size) {
        response.set('Content-Range', `bytes */${size}`).sendStatus(416);
        return;
      }
      response.status(206).set({
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      store.openBinary(file.id, { start, end }).pipe(response);
      return;
    }
    response.set('Content-Length', String(size));
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    store.openBinary(file.id).pipe(response);
  };

  const sendImage = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const file = findFile(request, response);
    if (file === undefined) return;
    if (
      mediaTypeFor(file.details.mimeType) === 'image' &&
      file.details.mimeType !== 'image/svg+xml'
    ) {
      await sendBinary(request, response);
      return;
    }
    if (!canServeImagePreview(file)) {
      response.status(404).json({ error: 'Preview not available' });
      return;
    }
    response.set({
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(previewPlaceholder.length),
      'Content-Type': 'image/png',
    });
    response.send(previewPlaceholder);
  };

  for (const suffix of ['binary', 'binary/cdn']) {
    app.get(
      `${config.apiPath}/file/:fileId/${suffix}`,
      (request, response, next) => {
        sendBinary(request, response, {
          download: request.query.dl === 'true',
        }).catch(next);
      },
    );
    app.head(
      `${config.apiPath}/file/:fileId/${suffix}`,
      (request, response, next) => {
        sendBinary(request, response).catch(next);
      },
    );
  }
  for (const suffix of ['image', 'image/cdn']) {
    app.get(
      `${config.apiPath}/file/:fileId/${suffix}`,
      (request, response, next) => {
        sendImage(request, response).catch(next);
      },
    );
  }
  app.get(
    `${config.apiPath}/file/:fileId/image/metadata`,
    (request, response) => {
      const file = findFile(request, response);
      if (file !== undefined && !canServeImagePreview(file)) {
        response.status(404).json({ error: 'Preview not available' });
      } else if (file !== undefined) {
        response.json({
          metadata: {
            pending: false,
            preview: {},
            original: { height: 1, width: 1 },
          },
        });
      }
    },
  );

  app.put(
    `${config.apiPath}/collection/:collection`,
    json,
    async (request, response) => {
      const body = recordValue(request.body);
      const removals = arrayValue(body.actions)
        .map(recordValue)
        .filter((action) => action.action === 'remove');
      await Promise.all(
        removals.map((action) => {
          const item = recordValue(action.item);
          return store.deleteFile(textValue(item.id));
        }),
      );
      response.sendStatus(200);
    },
  );
  app.delete(`${config.apiPath}/file/:fileId`, async (request, response) => {
    response.sendStatus(
      (await store.deleteFile(textValue(request.params.fileId))) ? 204 : 404,
    );
  });

  app.use(
    (
      _error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      config.logger.error('MEDIA_REQUEST_FAILED');
      response.status(500).json({ error: 'Internal error' });
    },
  );

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const candidate = app.listen(config.port, config.host, () => {
      candidate.removeListener('error', reject);
      resolve(candidate);
    });
    candidate.once('error', reject);
  });
  const address = httpServer.address() as AddressInfo | null;
  if (address === null) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    throw new Error('Media server did not expose a listening address.');
  }
  const apiBaseUrl = `http://${config.host}:${address.port}${config.apiPath}`;
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    apiBaseUrl,
    close(): Promise<void> {
      if (closePromise !== undefined) return closePromise;
      closePromise = new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error !== undefined) reject(error);
          else resolve();
        });
        httpServer.closeIdleConnections?.();
      });
      return closePromise;
    },
  });
}
