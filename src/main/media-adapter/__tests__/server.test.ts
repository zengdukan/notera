import type {
  AttachmentContentReader,
  ImportAttachmentInput,
} from '@notera/application';

import { startMediaAdapterServer, type MediaAdapterServer } from '../server';

const profileId = '10000000-0000-4000-8000-000000000001';
const noteId = '20000000-0000-4000-8000-000000000001';
const fileId = '30000000-0000-4000-8000-000000000001';
const origin = 'null';

async function bytesOf(source: AsyncIterable<Uint8Array>): Promise<number[]> {
  const values: number[] = [];
  for await (const chunk of source) values.push(...chunk);
  return values;
}

describe('production Media Adapter server', () => {
  const servers: MediaAdapterServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('authenticates one note, streams Atlaskit upload routes, and serves exact ranges', async () => {
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
        `${server.apiBaseUrl}/chunk/first?uploadId=${uploadId}&partNumber=0`,
        {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/octet-stream' },
          body: Uint8Array.from([1, 2, 3]),
        },
      ),
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      fetch(
        `${server.apiBaseUrl}/chunk/second?uploadId=${uploadId}&partNumber=1`,
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
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(
      Uint8Array.from([2, 3, 4]),
    );
    expect(closeReader).toHaveBeenCalledTimes(1);

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
});
