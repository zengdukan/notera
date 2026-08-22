import { asLocalProfileId, type LocalProfileId } from '@notera/domain';

import { ApplicationError } from './errors';
import type { CatalogEntry, Page, PageRequest, ProfileSummary } from './types';

function fail(): never {
  throw new ApplicationError('OPERATION_FAILED');
}

function encode(entry: CatalogEntry): string {
  return Buffer.from(
    JSON.stringify([entry.sortOrder, entry.localProfileId]),
    'utf8',
  ).toString('base64url');
}

function decode(cursor: string): readonly [number, LocalProfileId] {
  try {
    if (typeof cursor !== 'string' || cursor.length === 0) fail();
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) fail();
    const value = JSON.parse(bytes.toString('utf8')) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      !Number.isSafeInteger(value[0]) ||
      (value[0] as number) < 0
    ) {
      fail();
    }
    return [value[0] as number, asLocalProfileId(value[1])];
  } catch {
    return fail();
  }
}

export function paginateCatalog(
  entries: readonly CatalogEntry[],
  input: PageRequest,
  currentId?: LocalProfileId,
): Page<ProfileSummary> {
  if (
    input === null ||
    typeof input !== 'object' ||
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    Object.keys(input).some((key) => key !== 'cursor' && key !== 'limit')
  ) {
    fail();
  }
  let start = 0;
  if (input.cursor !== undefined) {
    const [sortOrder, id] = decode(input.cursor);
    const position = entries.findIndex(
      (entry) => entry.sortOrder === sortOrder && entry.localProfileId === id,
    );
    if (position < 0) fail();
    start = position + 1;
  }
  const selected = entries.slice(start, start + input.limit);
  const items = selected.map(({ sortOrder: _sortOrder, ...entry }) =>
    Object.freeze({ ...entry, isCurrent: entry.localProfileId === currentId }),
  );
  const last = selected.at(-1);
  return Object.freeze({
    items: Object.freeze(items),
    ...(start + selected.length < entries.length && last !== undefined
      ? { nextCursor: encode(last) }
      : {}),
  });
}
