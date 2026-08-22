import type {
  AdfDocument,
  Folder,
  FolderId,
  Note,
  NoteId,
  RegularFolder,
  VaultId,
  VaultIdentity,
} from '@notera/domain';
import {
  asAdfDocument,
  asFolderId,
  asFolderName,
  asNoteId,
  asSortOrder,
  asTimestamp,
  createNote,
  createRegularFolder,
} from '@notera/domain';

import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  openTestConnection,
  OTHER_VAULT_ID,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface PageRequest {
  readonly cursor?: string;
  readonly limit: number;
}

interface Page<Value> {
  readonly items: readonly Value[];
  readonly nextCursor?: string;
}

interface ContentSort {
  readonly field: 'CREATED_AT' | 'UPDATED_AT' | 'TITLE';
  readonly direction: 'ASC' | 'DESC';
}

interface FolderReaderApi {
  get(id: FolderId): Folder | undefined;
  listAll(): readonly Folder[];
  listChildren(
    parentId: FolderId,
    page: PageRequest,
  ): { readonly items: readonly Folder[]; readonly nextCursor?: string };
  listSubtree(rootId: FolderId): readonly Folder[];
  listContent(
    folderId: FolderId,
    page: PageRequest,
    sort?: ContentSort,
  ): Page<Folder | Note>;
}

interface FolderWriterApi extends FolderReaderApi {
  insert(folder: Folder): void;
  replace(folder: Folder): void;
  replaceSortOrders(folders: readonly Folder[]): void;
}

interface NoteWriterApi {
  insert(note: Note): void;
}

interface ProfileMetadataReaderApi {
  get(): {
    readonly profileName: string;
    readonly vaultMetaDigest: Uint8Array;
    readonly pendingVaultMetaDigest?: Uint8Array;
  };
}

interface ProfileMetadataWriterApi extends ProfileMetadataReaderApi {
  rename(profileName: string): void;
  prepareVaultMetaDigest(input: {
    readonly currentDigest: Uint8Array;
    readonly pendingDigest: Uint8Array;
  }): void;
  finalizeVaultMetaDigest(input: {
    readonly currentDigest: Uint8Array;
    readonly pendingDigest: Uint8Array;
  }): void;
  cancelVaultMetaDigest(input: {
    readonly currentDigest: Uint8Array;
    readonly pendingDigest: Uint8Array;
  }): void;
}

interface VaultTransactionApi {
  readonly profileMetadata: ProfileMetadataWriterApi;
  readonly folders: FolderWriterApi;
  readonly notes: NoteWriterApi;
}

interface VaultDatabaseApi {
  readonly profileMetadata: ProfileMetadataReaderApi;
  readonly folders: FolderReaderApi;
  transaction<Result>(
    callback: (transaction: VaultTransactionApi) => Result,
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
    expectedVaultId: VaultId;
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
    profileName: 'Initial Profile',
    vaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return { database, filePath };
}

function reopenVault(filePath: string): VaultDatabaseApi {
  const database = databaseModule().openVaultDatabase({
    filePath,
    databaseKey: databaseKey(),
    expectedVaultId: TEST_VAULT_ID,
    expectedVaultMetaDigest: vaultMetaDigest(),
  });
  openDatabases.push(database);
  return database;
}

function folderId(index: number): FolderId {
  return asFolderId(
    `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

function regularFolder(
  index: number,
  parentId: FolderId,
  sortOrder = index,
  vaultId = TEST_VAULT_ID,
): RegularFolder {
  return createRegularFolder({
    id: folderId(index),
    vaultId,
    parentId,
    name: asFolderName(`Folder ${index}`),
    sortOrder: asSortOrder(sortOrder),
    createdAt: asTimestamp(index),
    updatedAt: asTimestamp(index),
  });
}

const emptyDocument: AdfDocument = asAdfDocument({
  type: 'doc',
  version: 1,
});

function noteId(index: number): NoteId {
  return asNoteId(
    `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
  );
}

function note(input: {
  readonly index: number;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}): Note {
  return createNote({
    id: noteId(input.index),
    vaultId: TEST_VAULT_ID,
    folderId: TEST_ROOT_FOLDER_ID,
    title: input.title,
    document: emptyDocument,
    sortOrder: asSortOrder(input.index),
    createdAt: asTimestamp(input.createdAt),
    updatedAt: asTimestamp(input.updatedAt),
  });
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
  openDatabases.splice(0).forEach((database) => {
    database.close();
  });
  cleanupTempDatabases();
});

describe('vault transactions and folder repositories', () => {
  it('commits synchronously and rolls back while preserving callback errors', () => {
    const { database } = createVault();
    database.transaction((transaction) => {
      transaction.profileMetadata.rename('Committed Profile');
    });
    expect(database.profileMetadata.get().profileName).toBe(
      'Committed Profile',
    );

    const sentinel = new Error('caller failure');
    try {
      database.transaction((transaction) => {
        transaction.profileMetadata.rename('Rolled Back Profile');
        throw sentinel;
      });
      throw new Error('Expected caller failure');
    } catch (error) {
      expect(error).toBe(sentinel);
    }
    expect(database.profileMetadata.get().profileName).toBe(
      'Committed Profile',
    );
  });

  it('rolls back thenables, nested transactions, and close inside a transaction', () => {
    const { database } = createVault();

    expectStorageCode(
      () =>
        database.transaction((transaction) => {
          transaction.profileMetadata.rename('Async Profile');
          return Promise.resolve('not allowed');
        }),
      'STORAGE_OPERATION_FAILED',
    );
    expect(database.profileMetadata.get().profileName).toBe('Initial Profile');

    expectStorageCode(
      () =>
        database.transaction((transaction) => {
          transaction.profileMetadata.rename('Nested Profile');
          database.transaction(() => undefined);
        }),
      'STORAGE_OPERATION_FAILED',
    );
    expect(database.profileMetadata.get().profileName).toBe('Initial Profile');

    expectStorageCode(
      () =>
        database.transaction((transaction) => {
          transaction.profileMetadata.rename('Closed Profile');
          database.close();
        }),
      'STORAGE_OPERATION_FAILED',
    );
    expect(database.profileMetadata.get().profileName).toBe('Initial Profile');
  });

  it('expires writers after a transaction and readers after database close', () => {
    const { database } = createVault();
    let captured: FolderWriterApi | undefined;
    database.transaction((transaction) => {
      captured = transaction.folders;
    });
    expectStorageCode(
      () => captured?.insert(regularFolder(1, TEST_ROOT_FOLDER_ID)),
      'STORAGE_OPERATION_FAILED',
    );

    const reader = database.folders;
    database.close();
    expectStorageCode(() => reader.listAll(), 'DATABASE_CLOSED');
  });

  it('round-trips profile metadata without exposing mutable digest storage', () => {
    const { database } = createVault();
    const first = database.profileMetadata.get();
    first.vaultMetaDigest.fill(0);
    expect(database.profileMetadata.get().vaultMetaDigest).toEqual(
      vaultMetaDigest(),
    );

    const current = vaultMetaDigest();
    const pending = vaultMetaDigest(77);
    database.transaction((transaction) => {
      transaction.profileMetadata.rename('Renamed Profile');
      transaction.profileMetadata.prepareVaultMetaDigest({
        currentDigest: current,
        pendingDigest: pending,
      });
    });
    pending.fill(0);
    expect(database.profileMetadata.get()).toEqual({
      profileName: 'Renamed Profile',
      vaultMetaDigest: vaultMetaDigest(),
      pendingVaultMetaDigest: vaultMetaDigest(77),
    });

    const readPending = database.profileMetadata.get();
    readPending.pendingVaultMetaDigest?.fill(0);
    expect(database.profileMetadata.get().pendingVaultMetaDigest).toEqual(
      vaultMetaDigest(77),
    );

    database.transaction((transaction) => {
      transaction.profileMetadata.finalizeVaultMetaDigest({
        currentDigest: current,
        pendingDigest: vaultMetaDigest(77),
      });
    });
    expect(database.profileMetadata.get()).toEqual({
      profileName: 'Renamed Profile',
      vaultMetaDigest: vaultMetaDigest(77),
    });

    const next = vaultMetaDigest(88);
    database.transaction((transaction) => {
      transaction.profileMetadata.prepareVaultMetaDigest({
        currentDigest: vaultMetaDigest(77),
        pendingDigest: next,
      });
      transaction.profileMetadata.cancelVaultMetaDigest({
        currentDigest: vaultMetaDigest(77),
        pendingDigest: next,
      });
    });
    expect(
      database.profileMetadata.get().pendingVaultMetaDigest,
    ).toBeUndefined();

    expectStorageCode(
      () =>
        database.transaction((transaction) => {
          transaction.profileMetadata.prepareVaultMetaDigest({
            currentDigest: vaultMetaDigest(77),
            pendingDigest: new Uint8Array(31),
          });
        }),
      'STORAGE_OPERATION_FAILED',
    );

    expectStorageCode(
      () =>
        database.transaction((transaction) => {
          transaction.profileMetadata.prepareVaultMetaDigest({
            currentDigest: vaultMetaDigest(66),
            pendingDigest: next,
          });
        }),
      'STORAGE_OPERATION_FAILED',
    );
  });

  it('persists directories beyond the former depth limit and paginates children', () => {
    const { database } = createVault();
    const directChildren = [
      regularFolder(1, TEST_ROOT_FOLDER_ID, 1),
      regularFolder(2, TEST_ROOT_FOLDER_ID, 1),
      regularFolder(3, TEST_ROOT_FOLDER_ID, 2),
      regularFolder(4, TEST_ROOT_FOLDER_ID, 3),
    ];
    database.transaction((transaction) => {
      directChildren.forEach((folder) => transaction.folders.insert(folder));
      let parentId = directChildren[3].id;
      for (let index = 10; index < 310; index += 1) {
        const folder = regularFolder(index, parentId);
        transaction.folders.insert(folder);
        parentId = folder.id;
      }
    });

    expect(database.folders.listAll()).toHaveLength(305);
    expect(database.folders.listSubtree(directChildren[3].id)).toHaveLength(
      301,
    );
    expect(database.folders.get(folderId(309))?.kind).toBe('REGULAR');

    const firstPage = database.folders.listChildren(TEST_ROOT_FOLDER_ID, {
      limit: 2,
    });
    expect(firstPage.items.map(({ id }) => id)).toEqual([
      folderId(1),
      folderId(2),
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const secondPage = database.folders.listChildren(TEST_ROOT_FOLDER_ID, {
      cursor: firstPage.nextCursor,
      limit: 2,
    });
    expect(secondPage.items.map(({ id }) => id)).toEqual([
      folderId(3),
      folderId(4),
    ]);
    expect(secondPage.nextCursor).toBeUndefined();

    expectStorageCode(
      () =>
        database.folders.listChildren(directChildren[3].id, {
          cursor: firstPage.nextCursor,
          limit: 2,
        }),
      'INVALID_CURSOR',
    );
    [-1, 0, 101, 1.5].forEach((limit) => {
      expectStorageCode(
        () => database.folders.listChildren(TEST_ROOT_FOLDER_ID, { limit }),
        'INVALID_CURSOR',
      );
    });
    expectStorageCode(
      () =>
        database.folders.listChildren(TEST_ROOT_FOLDER_ID, {
          cursor: 'not-base64url-json',
          limit: 2,
        }),
      'INVALID_CURSOR',
    );
    const invalidPosition = Buffer.from(
      JSON.stringify({
        version: 1,
        kind: 'folders.children',
        fingerprint: `parent:${TEST_ROOT_FOLDER_ID}`,
        sortOrder: 1,
        lastId: 'not-a-canonical-uuid',
      }),
      'utf8',
    ).toString('base64url');
    expectStorageCode(
      () =>
        database.folders.listChildren(TEST_ROOT_FOLDER_ID, {
          cursor: invalidPosition,
          limit: 2,
        }),
      'INVALID_CURSOR',
    );
  });

  it('sorts mixed content with folders first and binds cursors to sort options', () => {
    const { database } = createVault();
    const zulu = createRegularFolder({
      ...regularFolder(31, TEST_ROOT_FOLDER_ID),
      name: asFolderName('Zulu'),
      createdAt: asTimestamp(10),
      updatedAt: asTimestamp(40),
    });
    const alpha = createRegularFolder({
      ...regularFolder(32, TEST_ROOT_FOLDER_ID),
      name: asFolderName('alpha'),
      createdAt: asTimestamp(20),
      updatedAt: asTimestamp(30),
    });
    const beta = note({
      index: 31,
      title: 'Beta',
      createdAt: 4,
      updatedAt: 10,
    });
    const aardvark = note({
      index: 32,
      title: 'aardvark',
      createdAt: 3,
      updatedAt: 20,
    });
    database.transaction((transaction) => {
      transaction.folders.insert(zulu);
      transaction.folders.insert(alpha);
      transaction.notes.insert(beta);
      transaction.notes.insert(aardvark);
    });

    const ids = (sort?: ContentSort) =>
      database.folders
        .listContent(TEST_ROOT_FOLDER_ID, { limit: 10 }, sort)
        .items.map(({ id }) => id);
    expect(ids()).toEqual([alpha.id, zulu.id, beta.id, aardvark.id]);
    expect(ids({ field: 'CREATED_AT', direction: 'ASC' })).toEqual([
      zulu.id,
      alpha.id,
      aardvark.id,
      beta.id,
    ]);
    expect(ids({ field: 'UPDATED_AT', direction: 'ASC' })).toEqual([
      alpha.id,
      zulu.id,
      beta.id,
      aardvark.id,
    ]);
    expect(ids({ field: 'TITLE', direction: 'ASC' })).toEqual([
      alpha.id,
      zulu.id,
      aardvark.id,
      beta.id,
    ]);
    expect(ids({ field: 'TITLE', direction: 'DESC' })).toEqual([
      zulu.id,
      alpha.id,
      beta.id,
      aardvark.id,
    ]);

    const first = database.folders.listContent(
      TEST_ROOT_FOLDER_ID,
      { limit: 1 },
      { field: 'TITLE', direction: 'ASC' },
    );
    expect(first.items.map(({ id }) => id)).toEqual([alpha.id]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(
      database.folders
        .listContent(
          TEST_ROOT_FOLDER_ID,
          { cursor: first.nextCursor, limit: 10 },
          { field: 'TITLE', direction: 'ASC' },
        )
        .items.map(({ id }) => id),
    ).toEqual([zulu.id, aardvark.id, beta.id]);
    expectStorageCode(
      () =>
        database.folders.listContent(
          TEST_ROOT_FOLDER_ID,
          { cursor: first.nextCursor, limit: 10 },
          { field: 'UPDATED_AT', direction: 'ASC' },
        ),
      'INVALID_CURSOR',
    );
  });

  it('enforces root, vault, parent, sorting, and cycle invariants atomically', () => {
    const { database, filePath } = createVault();
    const first = regularFolder(1, TEST_ROOT_FOLDER_ID, 1);
    const second = regularFolder(2, first.id, 2);
    const third = regularFolder(3, second.id, 3);
    database.transaction((transaction) => {
      transaction.folders.insert(first);
      transaction.folders.insert(second);
      transaction.folders.insert(third);
    });

    const cycle = createRegularFolder({
      ...first,
      parentId: third.id,
      updatedAt: asTimestamp(10),
    });
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.folders.replace(cycle),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expect(database.folders.get(first.id)).toEqual(first);

    const root = database.folders.get(TEST_ROOT_FOLDER_ID);
    expect(root).toBeDefined();
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.folders.replace(root as Folder),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.folders.insert(regularFolder(4, folderId(999), 4)),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );
    expectStorageCode(
      () =>
        database.transaction((transaction) =>
          transaction.folders.insert(
            regularFolder(5, TEST_ROOT_FOLDER_ID, 5, OTHER_VAULT_ID),
          ),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );

    database.transaction((transaction) => {
      transaction.folders.replaceSortOrders([
        createRegularFolder({
          ...first,
          sortOrder: asSortOrder(20),
          updatedAt: asTimestamp(20),
        }),
        createRegularFolder({
          ...second,
          sortOrder: asSortOrder(10),
          updatedAt: asTimestamp(20),
        }),
      ]);
    });
    expect(database.folders.get(first.id)?.sortOrder).toBe(20);
    expect(database.folders.get(second.id)?.sortOrder).toBe(10);

    database.close();
    const raw = openTestConnection(filePath);
    raw
      .prepare('UPDATE folders SET parent_id = ? WHERE id = ?')
      .run(third.id, second.id);
    raw.close();
    const reopened = reopenVault(filePath);
    expectStorageCode(
      () =>
        reopened.transaction((transaction) =>
          transaction.folders.insert(regularFolder(6, second.id, 6)),
        ),
      'RELATION_INTEGRITY_VIOLATION',
    );
  });
});
