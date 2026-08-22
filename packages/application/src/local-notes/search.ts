import { asFolderId } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import type { Page } from '../types';
import type { SearchResult } from './types';

export default function search(
  database: VaultDatabase,
  input: {
    readonly query: string;
    readonly folderId?: unknown;
    readonly cursor?: string;
    readonly limit: number;
  },
): Page<SearchResult> {
  const scope =
    input?.folderId === undefined
      ? ({ kind: 'VAULT' } as const)
      : ({
          kind: 'FOLDER_SUBTREE',
          folderId: asFolderId(input.folderId),
        } as const);
  const page = database.search.query(input?.query, scope, {
    cursor: input?.cursor,
    limit: input?.limit,
  });
  return Object.freeze({
    items: Object.freeze(
      page.items.map((item) =>
        Object.freeze({
          noteId: item.noteId,
          title: item.title,
          excerpt: item.excerpt,
          updatedAt: item.updatedAt,
          highlights: Object.freeze(
            item.highlights.map((highlight) => Object.freeze({ ...highlight })),
          ),
        }),
      ),
    ),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}
