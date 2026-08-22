import type {
  AttachmentContentReader,
  LocalAttachmentsService,
  SessionState,
} from '@notera/application';

import {
  createExportResourceLease,
  type ExportResourceProtocolPort,
} from '../resource-leases';

const operationId = '10000000-0000-4000-8000-000000000001';
const attachmentId = '20000000-0000-4000-8000-000000000002';
const profileId = '30000000-0000-4000-8000-000000000003';
const token = 't'.repeat(43);
const content = Uint8Array.from([0, 1, 2, 3, 4]);

function setup() {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let session: SessionState = {
    state: 'UNLOCKED',
    localProfileId: profileId as never,
    displayName: 'Profile',
    rootFolderId: '40000000-0000-4000-8000-000000000004' as never,
  };
  let now = 100;
  const readers: Array<{ close: jest.Mock; ranges: unknown[] }> = [];
  const service: LocalAttachmentsService = {
    importAttachment: jest.fn(),
    listForNote: jest.fn(),
    removeFromNote: jest.fn(),
    collectGarbage: jest.fn(),
    openReader: jest.fn(async () => {
      const close = jest.fn(async () => undefined);
      const ranges: unknown[] = [];
      const reader: AttachmentContentReader = {
        attachmentId: attachmentId as never,
        fileName: 'photo.png',
        mimeType: 'image/png',
        byteLength: content.length,
        stream: () =>
          (async function* stream() {
            yield content.slice(0, 2);
            yield content.slice(2);
          })(),
        streamRange: (start, endExclusive) => {
          ranges.push([start, endExclusive]);
          return (async function* streamRange() {
            yield content.slice(start, endExclusive);
          })();
        },
        close,
      };
      readers.push({ close, ranges });
      return reader;
    }),
  };
  const protocol: ExportResourceProtocolPort = {
    handle: jest.fn((_scheme, value) => {
      handler = value;
    }),
    unhandle: jest.fn(),
  };
  const progress: number[] = [];
  const lease = createExportResourceLease({
    protocol,
    service,
    getSessionState: () => session,
    expectedProfileId: profileId,
    operationId,
    token,
    expiresAt: 200,
    now: () => now,
    assets: [
      {
        id: attachmentId,
        fileName: 'photo.png',
        mimeType: 'image/png',
        byteLength: content.length,
        relativePath: 'assets/photo.png',
      },
    ],
    signal: new AbortController().signal,
    onBytes: (value: number) => progress.push(value),
  });
  lease.start();
  return {
    lease,
    protocol,
    service,
    readers,
    progress,
    request(path: string, init?: RequestInit) {
      if (handler === undefined) throw new Error('handler missing');
      return handler(new Request(`${lease.baseUrl}${path}`, init));
    },
    setSession(value: SessionState) {
      session = value;
    },
    expire() {
      now = 200;
    },
  };
}

describe('PDF export resource lease', () => {
  it('serves planned binary ranges and HEAD with controlled headers', async () => {
    const state = setup();
    const ranged = await state.request(`/file/${attachmentId}/binary`, {
      headers: { range: 'bytes=1-3' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 1-3/5');
    expect(ranged.headers.get('content-type')).toBe('image/png');
    expect(Array.from(new Uint8Array(await ranged.arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
    expect(state.readers[0].ranges).toEqual([[1, 4]]);
    expect(state.readers[0].close).toHaveBeenCalledTimes(1);
    expect(state.progress.at(-1)).toBe(3);

    const head = await state.request(`/file/${attachmentId}/image`, {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(state.readers[1].close).toHaveBeenCalledTimes(1);
  });

  it('serves bounded Atlaskit metadata and items without private paths', async () => {
    const state = setup();
    const metadata = await state.request(`/file/${attachmentId}`);
    expect(await metadata.json()).toMatchObject({
      data: {
        id: attachmentId,
        details: { name: 'photo.png', mimeType: 'image/png', size: 5 },
      },
    });
    const items = await state.request(`/items?ids=${attachmentId}`);
    const itemsText = await items.text();
    expect(JSON.parse(itemsText)).toMatchObject({
      data: { items: [{ id: attachmentId }] },
    });
    expect(itemsText).not.toContain('C:\\');
  });

  it('rejects wrong task identity, profile, expiry, IDs, and write methods', async () => {
    const state = setup();
    const wrongToken = state.lease.baseUrl.replace(token, 'x'.repeat(43));
    const handler = (state.protocol.handle as jest.Mock).mock.calls[0][1];
    expect(
      (await handler(new Request(`${wrongToken}/file/${attachmentId}`))).status,
    ).toBe(404);
    expect((await state.request('/file/not-planned/binary')).status).toBe(404);
    expect(
      (await state.request(`/file/${attachmentId}/binary`, { method: 'POST' }))
        .status,
    ).toBe(405);

    state.setSession({ state: 'LOCKED' });
    expect((await state.request(`/file/${attachmentId}`)).status).toBe(404);
    state.expire();
    expect((await state.request(`/file/${attachmentId}`)).status).toBe(404);
    expect(state.service.openReader).not.toHaveBeenCalled();
  });

  it('closes readers on cancellation and unregisters only its session protocol', async () => {
    const state = setup();
    const response = await state.request(`/file/${attachmentId}/binary`);
    await response.body?.cancel();
    expect(state.readers[0].close).toHaveBeenCalledTimes(1);

    state.lease.close();
    state.lease.close();
    expect(state.protocol.unhandle).toHaveBeenCalledTimes(1);
    expect(state.protocol.unhandle).toHaveBeenCalledWith('notera-export-media');
  });
});
