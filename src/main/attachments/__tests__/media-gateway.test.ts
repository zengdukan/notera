import {
  ApplicationError,
  type AttachmentContentReader,
  type LocalAttachmentsService,
} from '@notera/application';

import { createMediaGateway, type MediaProtocolPort } from '../media-gateway';

const uuid = (value: number) =>
  `10000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const attachmentId = uuid(1);
const firstProfileId = uuid(2);
const secondProfileId = uuid(3);
const content = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

function setup() {
  let now = Date.now();
  let currentProfileId = firstProfileId;
  let gateOpen = true;
  let openError: unknown;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let randomValue = 0;
  const readers: Array<{
    readonly close: jest.Mock<Promise<void>, []>;
    readonly ranges: Array<readonly [number, number]>;
  }> = [];

  const service: LocalAttachmentsService = {
    importAttachment: jest.fn(),
    listForNote: jest.fn(),
    removeFromNote: jest.fn(),
    collectGarbage: jest.fn(),
    openReader: jest.fn(async () => {
      if (openError !== undefined) throw openError;
      const close = jest.fn(async () => undefined);
      const ranges: Array<readonly [number, number]> = [];
      const reader: AttachmentContentReader = {
        attachmentId: attachmentId as never,
        fileName: 'private-name.png',
        mimeType: 'image/png',
        byteLength: content.byteLength,
        stream: () =>
          (async function* stream() {
            yield content.slice(0, 4);
            yield content.slice(4);
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
  const protocol: MediaProtocolPort = {
    handle: jest.fn((_scheme, value) => {
      handler = value;
    }),
    unhandle: jest.fn(),
  };
  const gateRun = jest.fn();
  const gate = {
    async run<Result>(operation: () => Promise<Result> | Result) {
      gateRun();
      if (!gateOpen) throw new ApplicationError('PROFILE_LOCKED');
      return operation();
    },
  };
  const gateway = createMediaGateway({
    protocol,
    service,
    gate,
    getSessionState: () => ({
      state: 'UNLOCKED' as const,
      localProfileId: currentProfileId as never,
      displayName: 'Profile',
      rootFolderId: uuid(4) as never,
    }),
    randomBytes: () => {
      const tokenBytes = new Uint8Array(32);
      tokenBytes[31] = randomValue;
      randomValue += 1;
      return tokenBytes;
    },
    now: () => now,
  });
  gateway.start();

  return {
    gateway,
    gateRun,
    protocol,
    service,
    readers,
    get handler() {
      if (handler === undefined) throw new Error('Protocol handler missing.');
      return handler;
    },
    setNow(value: number) {
      now = value;
    },
    setProfile(value: string) {
      currentProfileId = value;
    },
    lockGate() {
      gateOpen = false;
    },
    failOpen(error: unknown) {
      openError = error;
    },
  };
}

async function bytes(response: Response): Promise<number[]> {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

describe('MediaGateway', () => {
  it('issues random five-minute profile tokens only after reader validation', async () => {
    const state = setup();
    const first = await state.gateway.issue(attachmentId);
    const second = await state.gateway.issue(attachmentId);

    expect(first.url).toMatch(/^notera-media:\/\/preview\/[A-Za-z0-9_-]{43}$/u);
    expect(second.url).not.toBe(first.url);
    expect(first.expiresAt).toBeGreaterThan(Date.now());
    expect(second.expiresAt - first.expiresAt).toBe(0);
    expect(state.gateRun).toHaveBeenCalledTimes(2);
    expect(state.service.openReader).toHaveBeenCalledWith(attachmentId);
    expect(
      state.readers.map((reader) => reader.close.mock.calls.length),
    ).toEqual([1, 1]);

    state.lockGate();
    await expect(state.gateway.issue(attachmentId)).rejects.toMatchObject({
      code: 'PROFILE_LOCKED',
    });
    expect(state.service.openReader).toHaveBeenCalledTimes(2);
  });

  it('streams complete content with controlled response headers', async () => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    const response = await state.handler(new Request(issued.url));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(await bytes(response)).toEqual(Array.from(content));
    expect(state.readers.at(-1)?.close).toHaveBeenCalledTimes(1);
    expect(issued.url).not.toContain('private-name');
  });

  it.each([
    ['bytes=2-5', [2, 6], [2, 3, 4, 5]],
    ['bytes=6-', [6, 10], [6, 7, 8, 9]],
    ['bytes=-3', [7, 10], [7, 8, 9]],
  ])('serves one valid range %s', async (range, expectedRange, expected) => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    const response = await state.handler(
      new Request(issued.url, { headers: { range } }),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(
      `bytes ${expectedRange[0]}-${expectedRange[1] - 1}/10`,
    );
    expect(response.headers.get('content-length')).toBe(
      String(expected.length),
    );
    expect(await bytes(response)).toEqual(expected);
    expect(state.readers.at(-1)?.ranges).toEqual([expectedRange]);
    expect(state.readers.at(-1)?.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    'bytes=1-2,4-5',
    'bytes=a-2',
    'bytes=2 -3',
    'bytes=10-10',
    'bytes=8-7',
    'bytes=-0',
    'items=0-1',
  ])('rejects invalid or out-of-bounds range %s', async (range) => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    const response = await state.handler(
      new Request(issued.url, { headers: { range } }),
    );

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
    expect(await response.text()).toBe('');
    expect(state.readers.at(-1)?.close).toHaveBeenCalledTimes(1);
  });

  it('returns detail-free 404 for invalid, expired, and cross-profile tokens', async () => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    const initialReaderCount = state.readers.length;

    const invalid = await state.handler(
      new Request('notera-media://preview/not-a-token'),
    );
    expect(invalid.status).toBe(404);
    expect(await invalid.text()).toBe('');

    state.setProfile(secondProfileId);
    const crossProfile = await state.handler(new Request(issued.url));
    expect(crossProfile.status).toBe(404);

    state.setProfile(firstProfileId);
    state.setNow(issued.expiresAt);
    const expired = await state.handler(new Request(issued.url));
    expect(expired.status).toBe(404);
    expect(state.readers).toHaveLength(initialReaderCount);
  });

  it.each([
    ['ENTITY_NOT_FOUND', 410],
    ['BLOB_MISSING', 410],
    ['BLOB_CORRUPT', 410],
  ] as const)('maps %s reader failures to %d', async (code, status) => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    state.failOpen(new ApplicationError(code));

    const response = await state.handler(new Request(issued.url));
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });

  it('maps unknown reader failures to a detail-free 500', async () => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    state.failOpen(new Error('C:\\private\\attachment.png'));

    const response = await state.handler(new Request(issued.url));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
  });

  it('closes a reader when the response body is cancelled', async () => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    const response = await state.handler(new Request(issued.url));

    await response.body?.cancel();
    expect(state.readers.at(-1)?.close).toHaveBeenCalledTimes(1);
  });

  it('revokes tokens and installs/removes the protocol idempotently', async () => {
    const state = setup();
    const issued = await state.gateway.issue(attachmentId);
    state.gateway.start();
    expect(state.protocol.handle).toHaveBeenCalledTimes(1);

    state.gateway.revokeAll();
    expect((await state.handler(new Request(issued.url))).status).toBe(404);

    state.gateway.close();
    state.gateway.close();
    expect(state.protocol.unhandle).toHaveBeenCalledTimes(1);
    expect(state.protocol.unhandle).toHaveBeenCalledWith('notera-media');
  });
});
