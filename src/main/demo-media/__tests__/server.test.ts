/** @jest-environment node */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startDemoMediaServer, type DemoMediaServer } from '../server';

describe('demo Media HTTP service', () => {
  let dataRoot: string;
  let server: DemoMediaServer;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(os.tmpdir(), 'notera-media-server-'));
    server = await startDemoMediaServer({
      dataRoot,
      host: '127.0.0.1',
      port: 0,
    });
  });

  afterEach(async () => {
    await server.close();
    await rm(dataRoot, { force: true, recursive: true });
  });

  const request = (suffix: string, init?: RequestInit) =>
    fetch(`${server.apiBaseUrl}${suffix}`, init);

  it('binds a dynamic loopback port and returns compatible auth', async () => {
    expect(server.apiBaseUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/api\/media$/u,
    );
    await expect(
      request('/health').then((response) => response.json()),
    ).resolves.toEqual({ ok: true });

    const response = await request('/auth', {
      body: JSON.stringify({ context: { collectionName: 'demo' } }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    await expect(response.json()).resolves.toEqual({
      baseUrl: server.apiBaseUrl,
      clientId: 'local-atlaskit-editor',
      token: 'local-media-service',
    });
  });

  it('uploads, queries, ranges, previews, and deletes a binary', async () => {
    const upload = await request(
      '/file/binary?collection=demo&occurrenceKey=occ-1&name=pixel.png',
      {
        body: Buffer.from('0123456789'),
        headers: { 'content-type': 'image/png' },
        method: 'POST',
      },
    );
    expect(upload.status).toBe(201);
    const uploaded = (await upload.json()) as {
      data: { id: string; mediaType: string; size: number };
    };
    expect(uploaded.data).toMatchObject({ mediaType: 'image', size: 10 });

    const metadata = await request(`/file/${uploaded.data.id}?collection=demo`);
    expect(metadata.status).toBe(200);
    await expect(metadata.json()).resolves.toMatchObject({
      data: { id: uploaded.data.id, name: 'pixel.png' },
    });

    const items = await request('/items', {
      body: JSON.stringify({
        descriptors: [{ collection: 'demo', id: uploaded.data.id }],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    await expect(items.json()).resolves.toMatchObject({
      data: { items: [{ id: uploaded.data.id, type: 'file' }] },
    });

    const range = await request(`/file/${uploaded.data.id}/binary`, {
      headers: { range: 'bytes=2-5' },
    });
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 2-5/10');
    await expect(range.text()).resolves.toBe('2345');

    const image = await request(`/file/${uploaded.data.id}/image`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/png');

    const removed = await request(`/file/${uploaded.data.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
    expect((await request(`/file/${uploaded.data.id}`)).status).toBe(404);
  });

  it('supports pre-created files and chunked uploads', async () => {
    const created = await request('/upload/createWithFiles', {
      body: JSON.stringify({
        descriptors: [
          {
            collection: 'demo',
            fileId: 'file-1',
            occurrenceKey: 'occurrence-1',
          },
        ],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const payload = (await created.json()) as {
      data: { created: Array<{ fileId: string; uploadId: string }> };
    };
    const [{ uploadId }] = payload.data.created;

    expect(
      (
        await request('/chunk/chunk-1', {
          body: Buffer.from('hello '),
          method: 'PUT',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request('/chunk/chunk-2', {
          body: Buffer.from('world'),
          method: 'PUT',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(`/upload/${uploadId}/chunks`, {
          body: JSON.stringify({ chunks: ['chunk-1', 'chunk-2'] }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        })
      ).status,
    ).toBe(200);

    const finalized = await request(
      '/file/upload?replaceFileId=file-1&collection=demo',
      {
        body: JSON.stringify({
          mimeType: 'text/plain',
          name: 'greeting.txt',
          uploadId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(finalized.status).toBe(200);
    expect(await (await request('/file/file-1/binary')).text()).toBe(
      'hello world',
    );
  });

  it('closes idempotently', async () => {
    await server.close();
    await expect(server.close()).resolves.toBeUndefined();
  });
});
