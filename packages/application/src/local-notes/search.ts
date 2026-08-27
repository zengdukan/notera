import { asFolderId } from '@notera/domain';
import type { VaultDatabase } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';
import type { Page } from '../types';
import type { FolderPathItem, SearchResult } from './types';

function folderPathFor(
  database: VaultDatabase,
  noteId: SearchResult['noteId'],
  folders: ReadonlyMap<
    string,
    ReturnType<VaultDatabase['folders']['listAll']>[number]
  >,
): readonly FolderPathItem[] {
  const note = database.notes.get(noteId);
  if (note === undefined) throw new ApplicationError('ENTITY_NOT_FOUND');
  const reversed: FolderPathItem[] = [];
  const visited = new Set<string>();
  let current = folders.get(note.folderId);
  if (current === undefined) throw new ApplicationError('DB_CORRUPT');
  for (;;) {
    if (visited.has(current.id)) throw new ApplicationError('DB_CORRUPT');
    visited.add(current.id);
    reversed.push(
      Object.freeze({
        id: current.id,
        name: current.kind === 'ROOT' ? '' : current.name,
      }),
    );
    if (current.kind === 'ROOT') break;
    const parent = folders.get(current.parentId);
    if (parent === undefined) throw new ApplicationError('DB_CORRUPT');
    current = parent;
  }
  return Object.freeze(reversed.reverse());
}

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
  const folders = new Map(
    database.folders.listAll().map((folder) => [folder.id, folder]),
  );
  return Object.freeze({
    items: Object.freeze(
      page.items.map((item) =>
        Object.freeze({
          noteId: item.noteId,
          title: item.title,
          excerpt: item.excerpt,
          folderPath: folderPathFor(database, item.noteId, folders),
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
