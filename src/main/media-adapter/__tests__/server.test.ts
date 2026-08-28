import type {
  AttachmentContentReader,
  ImportAttachmentInput,
} from '@notera/application';

import { startMediaAdapterServer, type MediaAdapterServer } from '../server';

const profileId = '10000000-0000-4000-8000-000000000001';
const noteId = '20000000-0000-4000-8000-000000000001';
const fileId = '30000000-0000-4000-8000-000000000001';
const videoId = '30000000-0000-4000-8000-000000000002';
const documentId = '30000000-0000-4000-8000-000000000003';
const origin = 'http://localhost:1212';

interface FixtureFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

async function bytesOf(source: AsyncIterable<Uint8Array>): Promise<number[]> {
  const values: number[] = [];
  for await (const chunk of source) values.push(...chunk);
  return values;
}

describe('production Media Adapter server', () => {
  const servers: MediaAdapterServer[] = [];

  const startReadOnlyServer = async (
    files: ReadonlyMap<string, FixtureFile>,
  ) => {
    const server = await startMediaAdapterServer({
      allowedOrigin: origin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      notes: { getNote: jest.fn(async () => ({ id: noteId })) },
      attachments: {
        importAttachment: jest.fn(),
        openReader: jest.fn(async (id: string) => {
          const file = files.get(id);
          if (!file) throw new Error('missing');
          return {
            attachmentId: id as never,
            fileName: file.fileName,
            mimeType: file.mimeType,
            byteLength: file.bytes.byteLength,
            async *stream() {
              yield file.bytes;
            },
            async *streamRange(start, endExclusive) {
              yield file.bytes.slice(start, endExclusive);
            },
            close: async () => undefined,
          } satisfies AttachmentContentReader;
        }),
      },
      randomBytes: () => new Uint8Array(32).fill(7),
      randomUUID: () => fileId,
      now: () => 1_000,
    });
    servers.push(server);

    const authResponse = await fetch(`${server.apiBaseUrl}/auth`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId, context: {} }),
    });
    expect(authResponse.status).toBe(200);
    const auth = (await authResponse.json()) as {
      token: string;
      clientId: string;
      collection: string;
    };
    const headers = {
      Origin: origin,
      Authorization: `Bearer ${auth.token}`,
      'X-Client-Id': auth.clientId,
    };
    const fileUrl = (id: string, suffix: string) =>
      `${server.apiBaseUrl}/file/${id}${suffix ? `/${suffix}` : ''}?collection=${encodeURIComponent(auth.collection)}`;

    return { fileUrl, headers };
  };

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('serves the original bytes for supported bitmap image previews', async () => {
    const imageBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const { fileUrl, headers } = await startReadOnlyServer(
      new Map([
        [
          fileId,
          {
            fileName: 'pixel.png',
            mimeType: 'image/png',
            bytes: imageBytes,
          },
        ],
      ]),
    );

    const previewResponse = await fetch(fileUrl(fileId, 'image'), {
      headers,
    });
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await previewResponse.arrayBuffer())).toEqual(
      imageBytes,
    );
  });

  it('serves a valid PNG image representation for video attachments', async () => {
    const videoBytes = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    ]);
    const { fileUrl, headers } = await startReadOnlyServer(
      new Map([
        [
          videoId,
          {
            fileName: 'clip.mp4',
            mimeType: 'video/mp4',
            bytes: videoBytes,
          },
        ],
      ]),
    );

    const metadataResponse = await fetch(fileUrl(videoId, ''), { headers });
    const metadata = (await metadataResponse.json()) as {
      data: { representations: { image?: object } };
    };
    expect(metadata.data.representations.image).toEqual({});

    const imageMetadataResponse = await fetch(
      fileUrl(videoId, 'image/metadata'),
      { headers },
    );
    expect(imageMetadataResponse.status).toBe(200);
    await expect(imageMetadataResponse.json()).resolves.toEqual({
      metadata: {
        pending: false,
        preview: {},
        original: { width: 1, height: 1 },
      },
    });

    const previewResponse = await fetch(fileUrl(videoId, 'image'), {
      headers,
    });
    const previewBytes = new Uint8Array(await previewResponse.arrayBuffer());
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers.get('content-type')).toBe('image/png');
    expect([...previewBytes.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(previewBytes).not.toEqual(videoBytes);

    const binaryResponse = await fetch(fileUrl(videoId, 'binary'), {
      headers,
    });
    expect(new Uint8Array(await binaryResponse.arrayBuffer())).toEqual(
      videoBytes,
    );
  });

  it('returns no image representation for attachments without a preview', async () => {
    const { fileUrl, headers } = await startReadOnlyServer(
      new Map([
        [
          documentId,
          {
            fileName: 'guide.pdf',
            mimeType: 'application/pdf',
            bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
          },
        ],
      ]),
    );

    const metadataResponse = await fetch(fileUrl(documentId, ''), { headers });
    const metadata = (await metadataResponse.json()) as {
      data: { representations: Record<string, object> };
    };
    expect(metadata.data.representations).toEqual({});

    const previewResponse = await fetch(fileUrl(documentId, 'image'), {
      headers,
    });
    expect(previewResponse.status).toBe(404);
    expect(previewResponse.headers.get('content-type')).toBeNull();
  });

  it('authenticates one note across Atlaskit upload, query download, and exact ranges', async () => {
    const imported = new Map<
      string,
      { bytes: Uint8Array; input: ImportAttachmentInput }
    >();
    const closeReader = jest.fn(async () => undefined);
    const server = await startMediaAdapterServer({
      allowedOrigin: origin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      notes: { getNote: jest.fn(async () => ({ id: noteId })) },
      attachments: {
        importAttachment: jest.fn(async (input: ImportAttachmentInput) => {
          const bytes = Uint8Array.from(await bytesOf(input.source));
          imported.set(String(input.attachmentId), { bytes, input });
          return {
            id: input.attachmentId!,
            fileName: input.fileName,
            mime: input.mimeType,
            byteLength: bytes.byteLength,
            localState: 'AVAILABLE' as const,
            previewable: true,
            createdAt: 1 as never,
          };
        }),
        openReader: jest.fn(async (id: string) => {
          const value = imported.get(id);
          if (!value) throw new Error('missing');
          const reader: AttachmentContentReader = {
            attachmentId: id as never,
            fileName: value.input.fileName,
            mimeType: value.input.mimeType,
            byteLength: value.bytes.byteLength,
            async *stream() {
              yield value.bytes;
            },
            async *streamRange(start, endExclusive) {
              yield value.bytes.slice(start, endExclusive);
            },
            close: closeReader,
          };
          return reader;
        }),
      },
      randomBytes: () => new Uint8Array(32).fill(5),
      randomUUID: (() => {
        let next = 10;
        return () =>
          `40000000-0000-4000-8000-${String(next++).padStart(12, '0')}`;
      })(),
      now: () => 1_000,
    });
    servers.push(server);

    const authResponse = await fetch(`${server.apiBaseUrl}/auth`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ noteId, context: {} }),
    });
    expect(authResponse.status).toBe(200);
    expect(authResponse.headers.get('access-control-allow-origin')).toBe(
      origin,
    );
    expect(authResponse.headers.get('access-control-allow-origin')).not.toBe(
      '*',
    );
    const auth = (await authResponse.json()) as {
      token: string;
      clientId: string;
      baseUrl: string;
      collection: string;
    };
    const headers = {
      Origin: origin,
      Authorization: `Bearer ${auth.token}`,
      'X-Client-Id': auth.clientId,
      'Content-Type': 'application/json',
    };

    const direct = await fetch(
      `${server.apiBaseUrl}/file/binary?collection=${encodeURIComponent(auth.collection)}&name=paste.bin`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: Uint8Array.from([9, 8]),
      },
    );
    expect(direct.status).toBe(201);
    const directBody = (await direct.json()) as { data: { id: string } };
    expect(imported.get(directBody.data.id)?.bytes).toEqual(
      Uint8Array.from([9, 8]),
    );
    expect(imported.get(directBody.data.id)?.input.reference).toMatchObject({
      kind: 'UPLOAD',
    });

    const create = await fetch(`${server.apiBaseUrl}/upload/createWithFiles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        descriptors: [{ fileId, collection: auth.collection, size: 5 }],
      }),
    });
    const created = (await create.json()) as {
      data: { created: Array<{ uploadId: string }> };
    };
    const { uploadId } = created.data.created[0];
    await expect(
      fetch(
        `${server.apiBaseUrl}/chunk/first?uploadId=${uploadId}&partNumber=1`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/octet-stream' },
          body: Uint8Array.from([1, 2, 3]),
        },
      ),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      fetch(
        `${server.apiBaseUrl}/chunk/second?uploadId=${uploadId}&partNumber=2`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/octet-stream' },
          body: Uint8Array.from([4, 5]),
        },
      ),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      fetch(`${server.apiBaseUrl}/upload/${uploadId}/chunks`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ chunks: ['first', 'second'], offset: 0 }),
      }),
    ).resolves.toMatchObject({ status: 200 });
    const finalized = await fetch(
      `${server.apiBaseUrl}/file/upload?collection=${encodeURIComponent(auth.collection)}&replaceFileId=${fileId}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          uploadId,
          name: 'image.png',
          mimeType: 'image/png',
          conditions: { size: 5 },
        }),
      },
    );
    expect(finalized.status).toBe(200);
    expect(imported.get(fileId)?.bytes).toEqual(
      Uint8Array.from([1, 2, 3, 4, 5]),
    );
    expect(imported.get(fileId)?.input).toMatchObject({
      attachmentId: fileId,
      noteId,
      reference: { kind: 'UPLOAD' },
    });

    const binaryHeaders = {
      Origin: origin,
      Authorization: `Bearer ${auth.token}`,
      'X-Client-Id': auth.clientId,
    };
    const ranged = await fetch(
      `${server.apiBaseUrl}/file/${fileId}/binary?collection=${encodeURIComponent(auth.collection)}`,
      { headers: { ...binaryHeaders, Range: 'bytes=1-3' } },
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(ranged.headers.get('cache-control')).toBe('no-store');
    expect(ranged.headers.get('content-disposition')).toBeNull();
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(
      Uint8Array.from([2, 3, 4]),
    );
    expect(closeReader).toHaveBeenCalledTimes(1);

    const downloadUrl = new URL(`${server.apiBaseUrl}/file/${fileId}/binary`);
    downloadUrl.search = new URLSearchParams({
      client: auth.clientId,
      collection: auth.collection,
      dl: 'true',
      'max-age': '2592000',
      token: auth.token,
    }).toString();
    const downloaded = await fetch(downloadUrl, {
      headers: { Referer: `${origin}/index.html` },
    });
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-disposition')).toBe('attachment');
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(
      Uint8Array.from([1, 2, 3, 4, 5]),
    );
    const probed = await fetch(downloadUrl, {
      method: 'HEAD',
      headers: {
        Origin: origin,
        'X-B3-SpanId': 'span',
        'X-B3-TraceId': 'trace',
      },
    });
    expect(probed.status).toBe(200);
    expect(probed.headers.get('content-length')).toBe('5');

    server.revokeAll();
    await expect(
      fetch(`${server.apiBaseUrl}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ descriptors: [] }),
      }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('rejects an untrusted Origin without wildcard CORS or internal details', async () => {
    const server = await startMediaAdapterServer({
      allowedOrigin: origin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      notes: { getNote: jest.fn() },
      attachments: { importAttachment: jest.fn(), openReader: jest.fn() },
      randomBytes: () => new Uint8Array(32).fill(1),
      randomUUID: () => fileId,
      now: () => 1_000,
    });
    servers.push(server);
    const response = await fetch(`${server.apiBaseUrl}/auth`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.invalid',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ noteId }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.text()).not.toMatch(
      /profile|note|token|path|error/iu,
    );
  });

  it('allows Atlaskit upload preflights with B3 trace headers', async () => {
    const allowedOrigin = 'http://localhost:1212';
    const server = await startMediaAdapterServer({
      allowedOrigin,
      getSessionState: () => ({ state: 'UNLOCKED', localProfileId: profileId }),
      notes: { getNote: jest.fn() },
      attachments: { importAttachment: jest.fn(), openReader: jest.fn() },
      randomBytes: () => new Uint8Array(32).fill(1),
      randomUUID: () => fileId,
      now: () => 1_000,
    });
    servers.push(server);

    const response = await fetch(
      `${server.apiBaseUrl}/upload/createWithFiles?hashAlgorithm=sha256`,
      {
        method: 'OPTIONS',
        headers: {
          Origin: allowedOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'authorization,content-type,x-b3-spanid,x-b3-traceid,x-client-id',
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      allowedOrigin,
    );
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'X-B3-SpanId',
    );
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'X-B3-TraceId',
    );
  });
});
