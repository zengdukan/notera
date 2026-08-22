import type {
  ContentVersion,
  Favorite,
  Note,
  NoteId,
  NoteTag,
  NoteVersion,
  NoteVersionId,
  Tag,
  TagId,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asNoteId,
  asNoteVersionId,
  asSortOrder,
  asTagId,
  asTagName,
  asTimestamp,
  createFavorite,
  createNote,
  createNoteTag,
  createTag,
  createUserVersion,
  restoreNoteVersion,
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

interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

interface TagWriterApi {
  get(id: TagId): Tag | undefined;
  list(page: { cursor?: string; limit: number }): Page<Tag>;
  listForNote(noteId: NoteId): readonly Tag[];
  insert(tag: Tag): void;
  replace(tag: Tag): void;
  delete(id: TagId): void;
  addToNote(value: NoteTag): void;
  removeFromNote(noteId: NoteId, tagId: TagId): void;
}

interface FavoriteWriterApi {
  list(page: { cursor?: string; limit: number }): Page<Favorite>;
  insert(value: Favorite): void;
  delete(noteId: NoteId): void;
  replaceSortOrders(values: readonly Favorite[]): void;
}

interface HistoryWriterApi {
  get(id: NoteVersionId): NoteVersion | undefined;
  listForNote(
    noteId: NoteId,
    page: { cursor?: string; limit: number },
  ): Page<NoteVersion>;
  insert(version: NoteVersion): void;
  restore(
    version: NoteVersion,
    protectionVersion: NoteVersion,
    restoredNote: Note,
    expectedContentVersion: ContentVersion,
  ): void;
}

interface VaultDatabaseApi {
  readonly tags: Omit<
    TagWriterApi,
    'insert' | 'replace' | 'delete' | 'addToNote' | 'removeFromNote'
  >;
  readonly favorites: Pick<FavoriteWriterApi, 'list'>;
  readonly history: Pick<HistoryWriterApi, 'get' | 'listForNote'>;
  readonly notes: { get(id: NoteId): Note | undefined };
  transaction<Result>(
    callback: (transaction: {
      readonly notes: { insert(note: Note): void };
      readonly tags: TagWriterApi;
      readonly favorites: FavoriteWriterApi;
      readonly history: HistoryWriterApi;
    }) => Result,
  ): Result;
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
  openVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    expectedVaultId: typeof TEST_VAULT_ID;
    expectedVaultMetaDigest: Uint8Array;
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
    profileName: 'Profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function note(index = 1): Note {
  return createNote({
    id: asNoteId(
      `30000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: `Note ${index}`,
    document: asAdfDocument({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `Body ${index}` }],
        },
      ],
    }),
    sortOrder: asSortOrder(index),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function tag(index: number, name = `Tag ${index}`): Tag {
  return createTag({
    id: asTagId(
      `40000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    ),
    vaultId: TEST_VAULT_ID,
    name: asTagName(name),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

function versionId(index: number): NoteVersionId {
  return asNoteVersionId(
    `50000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
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

describe('organization and immutable history repositories', () => {
  it('persists tags, idempotent note relations, favorites, sorting, and pages', () => {
    const { database } = createVault();
    const storedNote = note();
    const secondNote = note(2);
    const firstTag = tag(1, 'Alpha');
    const secondTag = tag(2, 'Beta');
    const relation = createNoteTag({
      vaultId: TEST_VAULT_ID,
      noteId: storedNote.id,
      tagId: firstTag.id,
    });
    const firstFavorite = createFavorite({
      vaultId: TEST_VAULT_ID,
      noteId: storedNote.id,
      sortOrder: asSortOrder(1),
      createdAt: asTimestamp(1),
    });
    const secondFavorite = createFavorite({
      vaultId: TEST_VAULT_ID,
      noteId: secondNote.id,
      sortOrder: asSortOrder(2),
      createdAt: asTimestamp(2),
    });
    database.transaction((transaction) => {
      transaction.notes.insert(storedNote);
      transaction.notes.insert(secondNote);
      transaction.tags.insert(firstTag);
      transaction.tags.insert(secondTag);
      transaction.tags.addToNote(relation);
      transaction.tags.addToNote(relation);
      transaction.favorites.insert(firstFavorite);
      transaction.favorites.insert(firstFavorite);
      transaction.favorites.insert(secondFavorite);
    });

    expect(database.tags.list({ limit: 1 }).items).toEqual([firstTag]);
    expect(database.tags.listForNote(storedNote.id)).toEqual([firstTag]);
    expect(database.favorites.list({ limit: 10 }).items).toEqual([
      firstFavorite,
      secondFavorite,
    ]);

    const renamed = createTag({
      ...firstTag,
      name: asTagName('Renamed'),
      updatedAt: asTimestamp(5),
    });
    database.transaction((transaction) => {
      transaction.tags.replace(renamed);
      transaction.tags.removeFromNote(storedNote.id, firstTag.id);
      transaction.tags.removeFromNote(storedNote.id, firstTag.id);
      transaction.favorites.replaceSortOrders([
        { ...firstFavorite, sortOrder: asSortOrder(2) },
        { ...secondFavorite, sortOrder: asSortOrder(1) },
      ]);
    });
    expect(database.tags.get(firstTag.id)).toEqual(renamed);
    expect(database.tags.listForNote(storedNote.id)).toEqual([]);
    expect(database.favorites.list({ limit: 10 }).items).toEqual([
      { ...secondFavorite, sortOrder: asSortOrder(1) },
      { ...firstFavorite, sortOrder: asSortOrder(2) },
    ]);

    database.transaction((transaction) => {
      transaction.tags.delete(firstTag.id);
      transaction.favorites.delete(storedNote.id);
      transaction.favorites.delete(secondNote.id);
    });
    expect(database.tags.get(firstTag.id)).toBeUndefined();
    expect(database.favorites.list({ limit: 10 }).items).toEqual([]);
  });

  it('rejects missing and trashed relation targets without partial writes', () => {
    const { database, filePath } = createVault();
    const storedNote = note();
    const storedTag = tag(1);
    database.transaction((transaction) => {
      transaction.notes.insert(storedNote);
      transaction.tags.insert(storedTag);
    });
    database.close();
    const raw = openTestConnection(filePath);
    raw
      .prepare(
        `INSERT INTO trash_entries(
         id, vault_id, object_type, object_id, original_parent_id,
         deleted_at, expires_at
       ) VALUES (?, ?, 'NOTE', ?, ?, 1, 2)`,
      )
      .run(
        '60000000-0000-4000-8000-000000000001',
        TEST_VAULT_ID,
        storedNote.id,
        TEST_ROOT_FOLDER_ID,
      );
    raw.close();
    const reopened = databaseModule().openVaultDatabase({
      filePath,
      databaseKey: databaseKey(),
      expectedVaultId: TEST_VAULT_ID,
      expectedVaultMetaDigest: vaultMetaDigest(),
    });
    openDatabases.push(reopened);
    expectStorageCode(
      () =>
        reopened.transaction((transaction) => {
          transaction.tags.addToNote(
            createNoteTag({
              vaultId: TEST_VAULT_ID,
              noteId: storedNote.id,
              tagId: storedTag.id,
            }),
          );
        }),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expectStorageCode(
      () =>
        reopened.transaction((transaction) => {
          transaction.favorites.insert(
            createFavorite({
              vaultId: TEST_VAULT_ID,
              noteId: storedNote.id,
              sortOrder: asSortOrder(1),
              createdAt: asTimestamp(1),
            }),
          );
        }),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expect(reopened.tags.listForNote(storedNote.id)).toEqual([]);
    expect(reopened.favorites.list({ limit: 10 }).items).toEqual([]);
  });

  it('stores uncompressed verified history and restores it atomically with FTS', () => {
    const { database, filePath } = createVault();
    const current = note();
    const historical = createUserVersion(current, versionId(1), asTimestamp(2));
    database.transaction((transaction) => {
      transaction.notes.insert(current);
      transaction.history.insert(historical);
    });
    expect(database.history.get(historical.id)).toEqual(historical);
    expect(
      database.history.listForNote(current.id, { limit: 10 }).items,
    ).toEqual([historical]);

    const plan = restoreNoteVersion({
      note: current,
      version: historical,
      protectionVersionId: versionId(2),
      restoredAt: asTimestamp(10),
    });
    database.transaction((transaction) => {
      transaction.history.restore(
        historical,
        plan.protectionVersion,
        plan.note,
        current.contentVersion,
      );
    });
    expect(database.notes.get(current.id)).toEqual(plan.note);
    expect(database.history.get(plan.protectionVersion.id)).toEqual(
      plan.protectionVersion,
    );

    database.close();
    const raw = openTestConnection(filePath);
    expect(
      raw
        .prepare(
          `SELECT adf_bytes = length(CAST(adf_json AS BLOB)) AS size_ok,
                length(adf_sha256) AS hash_bytes
         FROM note_versions WHERE id = ?`,
        )
        .get(historical.id),
    ).toEqual({ size_ok: 1, hash_bytes: 32 });
    raw
      .prepare(
        'UPDATE note_versions SET adf_bytes = adf_bytes + 1 WHERE id = ?',
      )
      .run(historical.id);
    raw.close();
    const reopened = databaseModule().openVaultDatabase({
      filePath,
      databaseKey: databaseKey(),
      expectedVaultId: TEST_VAULT_ID,
      expectedVaultMetaDigest: vaultMetaDigest(),
    });
    openDatabases.push(reopened);
    expectStorageCode(() => reopened.history.get(historical.id), 'DB_CORRUPT');
  });
});
