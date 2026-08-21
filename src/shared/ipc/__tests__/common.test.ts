import { z } from 'zod';
import {
  contentVersionSchema,
  createIpcResponseSchema,
  emptyObjectSchema,
  ipcFailure,
  limitedUnicodeString,
  sortOrderSchema,
  timestampSchema,
  uuidSchema,
} from '../common';
import {
  defineEventContract,
  defineRequestContract,
  parseEvent,
  parseRequest,
  parseResponse,
} from '../contract';
import { IPC_ERROR_MESSAGES } from '../errors';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';

const validUuid = '10000000-0000-4000-8000-000000000001';

describe('IPC common schemas', () => {
  it('accepts strict success and allowed failure responses', () => {
    const responseSchema = createIpcResponseSchema(z.string(), [
      'ENTITY_NOT_FOUND',
    ]);

    expect(responseSchema.parse({ ret: true, data: 'ok' })).toEqual({
      ret: true,
      data: 'ok',
    });
    expect(responseSchema.parse(ipcFailure('ENTITY_NOT_FOUND'))).toEqual({
      ret: false,
      error: {
        code: 'ENTITY_NOT_FOUND',
        message: IPC_ERROR_MESSAGES.ENTITY_NOT_FOUND,
      },
    });
    expect(() =>
      responseSchema.parse({ ret: true, data: 'ok', error: {} }),
    ).toThrow();
    expect(() =>
      responseSchema.parse(ipcFailure('PROFILE_LOCKED')),
    ).toThrow();
  });

  it('validates identifiers, integer values and strict empty objects', () => {
    expect(uuidSchema.parse(validUuid)).toBe(validUuid);
    expect(timestampSchema.parse(0)).toBe(0);
    expect(contentVersionSchema.parse(1)).toBe(1);
    expect(sortOrderSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(emptyObjectSchema.parse({})).toEqual({});

    expect(() => uuidSchema.parse('not-a-uuid')).toThrow();
    expect(() => timestampSchema.parse(-1)).toThrow();
    expect(() => contentVersionSchema.parse(0)).toThrow();
    expect(() => sortOrderSchema.parse(1.5)).toThrow();
    expect(() => emptyObjectSchema.parse({ extra: true })).toThrow();
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    const twoCodePoints = limitedUnicodeString(2);

    expect(twoCodePoints.parse('A😀')).toBe('A😀');
    expect(() => twoCodePoints.parse('A😀B')).toThrow();
  });

  it('enforces cursor page boundaries and strict page results', () => {
    const resultSchema = cursorPageSchema(z.string());

    expect(cursorPageRequestSchema.parse({ limit: 1 })).toEqual({ limit: 1 });
    expect(
      cursorPageRequestSchema.parse({ cursor: 'opaque', limit: 100 }),
    ).toEqual({ cursor: 'opaque', limit: 100 });
    expect(
      resultSchema.parse({ items: ['one'], nextCursor: 'next' }),
    ).toEqual({ items: ['one'], nextCursor: 'next' });

    expect(() => cursorPageRequestSchema.parse({ limit: 0 })).toThrow();
    expect(() => cursorPageRequestSchema.parse({ limit: 101 })).toThrow();
    expect(() => cursorPageRequestSchema.parse({ limit: 1.5 })).toThrow();
    expect(() =>
      cursorPageRequestSchema.parse({ cursor: '', limit: 10 }),
    ).toThrow();
    expect(() => resultSchema.parse({ items: [], extra: true })).toThrow();
  });
});

describe('IPC contract descriptors', () => {
  const requestContract = defineRequestContract({
    key: 'note.get',
    channel: 'notera:note:get',
    request: z.strictObject({ noteId: uuidSchema }),
    data: z.strictObject({ title: z.string() }),
    errors: ['ENTITY_NOT_FOUND'],
  });
  const eventContract = defineEventContract({
    key: 'profile.locked',
    channel: 'notera:profile:locked',
    payload: z.strictObject({ reason: z.literal('MANUAL') }),
  });

  it('parses requests and replaces invalid input with a fixed failure', () => {
    expect(parseRequest(requestContract, { noteId: validUuid })).toEqual({
      ret: true,
      data: { noteId: validUuid },
    });
    expect(parseRequest(requestContract, { noteId: 'secret-title' })).toEqual(
      ipcFailure('INVALID_IPC_REQUEST'),
    );
  });

  it('parses responses and never forwards invalid response details', () => {
    expect(parseResponse(requestContract, { ret: true, data: { title: 'x' } }))
      .toEqual({ ret: true, data: { title: 'x' } });
    expect(
      parseResponse(requestContract, {
        ret: true,
        data: { title: 'x', leakedPath: 'C:\\secret' },
      }),
    ).toEqual(ipcFailure('INVALID_IPC_RESPONSE'));
  });

  it('parses event payloads without exposing validation issues', () => {
    expect(parseEvent(eventContract, { reason: 'MANUAL' })).toEqual({
      ret: true,
      data: { reason: 'MANUAL' },
    });
    expect(parseEvent(eventContract, { reason: 'secret' })).toEqual(
      ipcFailure('INVALID_IPC_RESPONSE'),
    );
  });
});
