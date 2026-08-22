import type {
  Folder,
  FolderId,
  RegularFolder,
  VaultId,
  VaultIdentity,
} from '@notera/domain';
import {
  asFolderId,
  asFolderName,
  asSortOrder,
  asTimestamp,
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

interface FolderReaderApi {
  get(id: FolderId): Folder | undefined;
  listAll(): readonly Folder[];
  listChildren(
    parentId: FolderId,
    page: PageRequest,
  ): { readonly items: readonly Folder[]; readonly nextCursor?: string };
  listSubtree(rootId: FolderId): readonly Folder[];
}

interface FolderWriterApi extends FolderReaderApi {
  insert(folder: Folder): void;
  replace(folder: Folder): void;
  replaceSortOrders(folders: readonly Folder[]): void;
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
