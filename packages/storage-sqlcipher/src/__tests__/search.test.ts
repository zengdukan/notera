import type {
  Folder,
  FolderId,
  Note,
  NoteId,
  Timestamp,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTimestamp,
  asTrashEntryId,
  createNote,
  createRegularFolder,
} from '@notera/domain';

import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  openTestConnection,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface SearchHit {
  readonly noteId: NoteId;
  readonly title: string;
  readonly excerpt: string;
  readonly updatedAt: Timestamp;
  readonly highlights: readonly Readonly<{
    field: 'title' | 'excerpt';
    start: number;
    end: number;
  }>[];
}

type SearchScope =
  | Readonly<{ kind: 'VAULT' }>
  | Readonly<{ kind: 'FOLDER_SUBTREE'; folderId: FolderId }>;

interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

interface SearchIndexReport {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

interface VaultDatabaseApi {
  readonly search: {
    query(
      query: string,
      scope: SearchScope,
      page: Readonly<{ cursor?: string; limit: number }>,
    ): Page<SearchHit>;
  };
  transaction<Result>(
    callback: (transaction: {
      readonly folders: {
        insert(folder: Folder): void;
        replace(folder: Folder): void;
      };
      readonly notes: {
        insert(note: Note): void;
        replaceLocation(note: Note): void;
      };
    }) => Result,
  ): Result;
  checkSearchIndex(): SearchIndexReport;
  rebuildSearchIndex(): void;
  close(): void;
}

interface DatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: VaultIdentity;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultDatabaseApi;
}

function databaseModule(): DatabaseModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as DatabaseModule;
}

const openDatabases: VaultDatabaseApi[] = [];

function createVault(): { database: VaultDatabaseApi; filePath: string } {
  const filePath = tempDatabasePath();
  const database = databaseModule().createVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    identity: TEST_IDENTITY,
    profileName: 'Search profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function folderId(index: number): FolderId {
  return asFolderId(
    `20000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

function noteId(index: number): NoteId {
  return asNoteId(
    `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

function folder(index: number, parentId = TEST_ROOT_FOLDER_ID): Folder {
  return createRegularFolder({
    id: folderId(index),
    vaultId: TEST_VAULT_ID,
    parentId,
    name: asFolderName(`Folder ${index}`),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function note(
  index: number,
  input: Readonly<{
    folderId?: FolderId;
    title?: string;
    body?: string;
    updatedAt?: number;
  }> = {},
): Note {
  const time = input.updatedAt ?? index;
  return createNote({
    id: noteId(index),
    vaultId: TEST_VAULT_ID,
    folderId: input.folderId ?? TEST_ROOT_FOLDER_ID,
    title: input.title ?? `Title ${index}`,
    document: asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: input.body ?? `Body ${index}` }],
        },
      ],
    }),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(Math.min(index, time)),
    updatedAt: asTimestamp(time),
  });
}

function query(
  database: VaultDatabaseApi,
  value: string,
  scope: SearchScope = { kind: 'VAULT' },
): readonly SearchHit[] {
  return database.search.query(value, scope, { limit: 100 }).items;
}

function expectStorageCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(() => {
  openDatabases.splice(0).forEach((database) => database.close());
  cleanupTempDatabases();
});

describe('scoped search and index health', () => {
  it('returns original Unicode with code-point highlights and treats operators literally', () => {
    const { database } = createVault();
    const unicode = note(1, {
      title: 'Ｗeｉß café 🙂',
      body: `e\u0301lan 中文 🙂 AND OR NOT "quote" star* slash\\ percent% under_`,
    });
    const decoy = note(2, { title: 'OR only', body: 'unrelated' });
    database.transaction((transaction) => {
      transaction.notes.insert(unicode);
      transaction.notes.insert(decoy);
    });

    expect(query(database, 'weiss')).toEqual([
      expect.objectContaining({
        noteId: unicode.id,
        title: unicode.title,
        highlights: expect.arrayContaining([
          { field: 'title', start: 0, end: 4 },
        ]),
      }),
    ]);
    const composed = query(database, 'é')[0];
    expect(composed.excerpt).toContain('e\u0301lan');
    expect(composed.highlights).toContainEqual({
      field: 'excerpt',
      start: 0,
      end: 2,
    });
    expect(query(database, '中文').map(({ noteId: id }) => id)).toEqual([
      unicode.id,
    ]);
    expect(query(database, '🙂').map(({ noteId: id }) => id)).toEqual([
      unicode.id,
    ]);

    for (const literal of ['AND', 'NOT', '"', '*', '\\', '%', '_']) {
      expect(query(database, literal).map(({ noteId: id }) => id)).toEqual([
        unicode.id,
      ]);
    }
    expectStorageCode(() => query(database, '   '), 'STORAGE_OPERATION_FAILED');
  });

  it('uses the selected folder subtree, follows moves, and terminates on a damaged cycle', () => {
    const { database, filePath } = createVault();
    const parent = folder(1);
    const child = folder(2, parent.id);
    const sibling = folder(3);
    const parentNote = note(1, { folderId: parent.id, body: 'scope needle' });
    const childNote = note(2, { folderId: child.id, body: 'scope needle' });
    const siblingNote = note(3, { folderId: sibling.id, body: 'scope needle' });
    database.transaction((transaction) => {
      transaction.folders.insert(parent);
      transaction.folders.insert(child);
      transaction.folders.insert(sibling);
      transaction.notes.insert(parentNote);
      transaction.notes.insert(childNote);
      transaction.notes.insert(siblingNote);
    });

    const subtree = { kind: 'FOLDER_SUBTREE', folderId: parent.id } as const;
    expect(
      query(database, 'needle', subtree).map(({ noteId: id }) => id),
    ).toEqual([childNote.id, parentNote.id]);
    expect(
      query(database, 'needle', {
        kind: 'FOLDER_SUBTREE',
        folderId: TEST_ROOT_FOLDER_ID,
      }).map(({ noteId: id }) => id),
    ).toHaveLength(3);

    database.transaction((transaction) =>
      transaction.notes.replaceLocation({
        ...siblingNote,
        folderId: child.id,
        updatedAt: asTimestamp(10),
      }),
    );
    expect(query(database, 'needle', subtree)).toHaveLength(3);

    const raw = openTestConnection(filePath);
    raw
      .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
      .run(child.id, parent.id);
    expect(query(database, 'needle', subtree)).toHaveLength(3);
    raw
      .prepare(
        `INSERT INTO trash_entries(
           id, vault_id, object_type, object_id, original_parent_id,
           deleted_at, expires_at
         ) VALUES (?, ?, 'FOLDER', ?, ?, 20, 30)`,
      )
      .run(
        asTrashEntryId('30000000-0000-4000-8000-000000000001'),
        TEST_VAULT_ID,
        parent.id,
        TEST_ROOT_FOLDER_ID,
      );
    raw.close();
    expectStorageCode(
      () => query(database, 'needle', subtree),
      'ENTITY_NOT_FOUND',
    );
    expectStorageCode(
      () =>
        query(database, 'needle', {
          kind: 'FOLDER_SUBTREE',
          folderId: folderId(99),
        }),
      'ENTITY_NOT_FOUND',
    );
  });

  it('paginates deterministically and isolates cursors by query and scope', () => {
    const { database } = createVault();
    const child = folder(1);
    database.transaction((transaction) => {
      transaction.folders.insert(child);
      transaction.notes.insert(
        note(1, { title: 'needle title', updatedAt: 1 }),
      );
      transaction.notes.insert(note(2, { body: 'needle body', updatedAt: 3 }));
      transaction.notes.insert(
        note(3, { folderId: child.id, body: 'needle body', updatedAt: 2 }),
      );
    });

    const first = database.search.query(
      'needle',
      { kind: 'VAULT' },
      { limit: 2 },
    );
    expect(first.items.map(({ noteId: id }) => id)).toEqual([
      noteId(1),
      noteId(2),
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(
      database.search
        .query(
          'needle',
          { kind: 'VAULT' },
          {
            cursor: first.nextCursor,
            limit: 2,
          },
        )
        .items.map(({ noteId: id }) => id),
    ).toEqual([noteId(3)]);
    expectStorageCode(
      () =>
        database.search.query(
          'different',
          { kind: 'VAULT' },
          {
            cursor: first.nextCursor,
            limit: 2,
          },
        ),
      'INVALID_CURSOR',
    );
    expectStorageCode(
      () =>
        database.search.query(
          'needle',
          { kind: 'FOLDER_SUBTREE', folderId: child.id },
          { cursor: first.nextCursor, limit: 2 },
        ),
      'INVALID_CURSOR',
    );
  });

  it('detects index drift, rebuilds it, and rolls back a failed rebuild', () => {
    const { database, filePath } = createVault();
    const first = note(1, { body: 'health needle' });
    const second = note(2, { body: 'health needle' });
    database.transaction((transaction) => {
      transaction.notes.insert(first);
      transaction.notes.insert(second);
    });
    expect(database.checkSearchIndex()).toEqual({ ok: true, issues: [] });

    let raw = openTestConnection(filePath);
    raw.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(second.id);
    raw
      .prepare(
        `UPDATE search_metadata
         SET normalizer_version = normalizer_version + 1,
             index_state = 'NEEDS_REBUILD'`,
      )
      .run();
    raw.close();
    expect(database.checkSearchIndex()).toEqual({
      ok: false,
      issues: ['METADATA_INVALID', 'NOTE_COUNT_MISMATCH', 'ROWID_MISMATCH'],
    });
    expectStorageCode(
      () => query(database, 'needle'),
      'SEARCH_INDEX_UNAVAILABLE',
    );

    database.rebuildSearchIndex();
    expect(database.checkSearchIndex()).toEqual({ ok: true, issues: [] });
    expect(query(database, 'needle')).toHaveLength(2);

    raw = openTestConnection(filePath);
    const before = raw
      .prepare<{
        rowid: number;
        note_id: string;
      }>('SELECT rowid, note_id FROM notes_fts ORDER BY rowid')
      .all();
    raw.pragma('ignore_check_constraints = ON');
    raw
      .prepare('UPDATE notes SET adf_json = ? WHERE id = ?')
      .run('{', second.id);
    raw.close();
    expectStorageCode(() => database.rebuildSearchIndex(), 'DB_CORRUPT');
    raw = openTestConnection(filePath);
    expect(
      raw.prepare('SELECT rowid, note_id FROM notes_fts ORDER BY rowid').all(),
    ).toEqual(before);
    raw.close();
  });
});
