import { StorageError } from './errors';
import type { PageRequest } from './types';

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface CursorPayload {
  readonly version: 1;
  readonly kind: string;
  readonly fingerprint: string;
  readonly sortOrder: number;
  readonly lastId: string;
  readonly secondary?: string;
}

interface TextCursorPayload {
  readonly version: 1;
  readonly kind: string;
  readonly fingerprint: string;
  readonly sortText: string;
  readonly lastId: string;
  readonly secondary?: string;
}

export interface KeysetCursor {
  readonly sortOrder: number;
  readonly lastId: string;
  readonly secondary?: string;
}

export interface TextKeysetCursor {
  readonly sortText: string;
  readonly lastId: string;
  readonly secondary?: string;
}

function invalidCursor(): never {
  throw new StorageError('INVALID_CURSOR');
}

export function encodeCursor(
  kind: string,
  fingerprint: string,
  value: KeysetCursor,
): string {
  const payload: CursorPayload = {
    version: 1,
    kind,
    fingerprint,
    sortOrder: value.sortOrder,
    lastId: value.lastId,
    ...(value.secondary === undefined ? {} : { secondary: value.secondary }),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parsePageRequest(
  page: PageRequest,
  kind: string,
  fingerprint: string,
): KeysetCursor | undefined {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) {
    return invalidCursor();
  }
  if (page.cursor === undefined) {
    return undefined;
  }
  if (
    typeof page.cursor !== 'string' ||
    page.cursor.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(page.cursor)
  ) {
    return invalidCursor();
  }

  try {
    const bytes = Buffer.from(page.cursor, 'base64url');
    if (bytes.toString('base64url') !== page.cursor) {
      return invalidCursor();
    }
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return invalidCursor();
    }
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const keyList = keys.join(',');
    if (
      (keyList !== 'fingerprint,kind,lastId,sortOrder,version' &&
        keyList !== 'fingerprint,kind,lastId,secondary,sortOrder,version') ||
      record.version !== 1 ||
      record.kind !== kind ||
      record.fingerprint !== fingerprint ||
      typeof record.sortOrder !== 'number' ||
      !Number.isSafeInteger(record.sortOrder) ||
      record.sortOrder < 0 ||
      typeof record.lastId !== 'string' ||
      !CANONICAL_UUID.test(record.lastId) ||
      ('secondary' in record && typeof record.secondary !== 'string')
    ) {
      return invalidCursor();
    }
    return {
      sortOrder: record.sortOrder,
      lastId: record.lastId,
      ...(typeof record.secondary === 'string'
        ? { secondary: record.secondary }
        : {}),
    };
  } catch {
    return invalidCursor();
  }
}

export function encodeTextCursor(
  kind: string,
  fingerprint: string,
  value: TextKeysetCursor,
): string {
  const payload: TextCursorPayload = {
    version: 1,
    kind,
    fingerprint,
    sortText: value.sortText,
    lastId: value.lastId,
    ...(value.secondary === undefined ? {} : { secondary: value.secondary }),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parseTextPageRequest(
  page: PageRequest,
  kind: string,
  fingerprint: string,
): TextKeysetCursor | undefined {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) {
    return invalidCursor();
  }
  if (page.cursor === undefined) return undefined;
  if (
    typeof page.cursor !== 'string' ||
    page.cursor.length === 0 ||
    !/^[A-Za-z0-9_-]+$/.test(page.cursor)
  ) {
    return invalidCursor();
  }

  try {
    const bytes = Buffer.from(page.cursor, 'base64url');
    if (bytes.toString('base64url') !== page.cursor) return invalidCursor();
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return invalidCursor();
    }
    const record = parsed as Record<string, unknown>;
    const keyList = Object.keys(record).sort().join(',');
    if (
      (keyList !== 'fingerprint,kind,lastId,sortText,version' &&
        keyList !== 'fingerprint,kind,lastId,secondary,sortText,version') ||
      record.version !== 1 ||
      record.kind !== kind ||
      record.fingerprint !== fingerprint ||
      typeof record.sortText !== 'string' ||
      [...record.sortText].length > 1_000 ||
      typeof record.lastId !== 'string' ||
      !CANONICAL_UUID.test(record.lastId) ||
      ('secondary' in record && typeof record.secondary !== 'string')
    ) {
      return invalidCursor();
    }
    return {
      sortText: record.sortText,
      lastId: record.lastId,
      ...(typeof record.secondary === 'string'
        ? { secondary: record.secondary }
        : {}),
    };
  } catch {
    return invalidCursor();
  }
}
