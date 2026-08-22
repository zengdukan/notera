import { rmSync } from 'node:fs';

import type { VaultId } from '@notera/domain';

import { openNativeConnection, type SqlcipherConnection } from './connection';
import { mapNativeError, StorageError } from './errors';
import { PRODUCTION_MIGRATIONS } from './migrations/registry';
import { runMigrations } from './migrations/runner';
import {
  asFolderReader,
  FolderRepository,
} from './repositories/folders';
import {
  asProfileMetadataReader,
  ProfileMetadataRepository,
} from './repositories/profile-metadata';
import { asNoteReader, NoteRepository } from './repositories/notes';
import { asTagReader, TagRepository } from './repositories/tags';
import {
  asFavoriteReader,
  FavoriteRepository,
} from './repositories/favorites';
import { asHistoryReader, HistoryRepository } from './repositories/history';
import { asTrashReader, TrashRepository } from './repositories/trash';
import { ContentPlanRepository } from './repositories/content-plans';
import { asAttachmentReader, AttachmentRepository } from './repositories/attachments';
import {
  createCurrentSchema,
  CURRENT_SCHEMA_VERSION,
} from './schema/current';
import { readSchemaVersion, validateVaultMetadata } from './schema/inspect';
import type {
  CreateVaultDatabaseOptions,
  FolderReader,
  NoteReader,
  TagReader,
  FavoriteReader,
  HistoryReader,
  TrashReader,
  AttachmentReader,
  OpenVaultDatabaseOptions,
  ProfileMetadataReader,
  VaultTransaction,
} from './types';

function closeAfterFailure(database: SqlcipherConnection): void {
  try {
    database.close();
  } catch {
    // Preserve the safe error that caused the open or initialization failure.
  }
}

function removeCreatedDatabaseFiles(filePath: string): void {
  [filePath, `${filePath}-wal`, `${filePath}-shm`].forEach((candidate) => {
    try {
      rmSync(candidate, { force: true });
    } catch {
      // Preserve the initialization failure.
    }
  });
}

export class VaultDatabase {
  private connection: SqlcipherConnection | undefined;

  private transactionActive = false;

  readonly profileMetadata: ProfileMetadataReader;

  readonly folders: FolderReader;

  readonly notes: NoteReader;

  readonly tags: TagReader;

  readonly favorites: FavoriteReader;

  readonly history: HistoryReader;

  readonly trash: TrashReader;
  readonly attachments: AttachmentReader;

  private readonly vaultId: VaultId;

  constructor(connection: SqlcipherConnection, vaultId: VaultId) {
    this.connection = connection;
    this.vaultId = vaultId;
    this.profileMetadata = asProfileMetadataReader(
      new ProfileMetadataRepository(() => this.requireConnection(), vaultId),
    );
    this.folders = asFolderReader(
      new FolderRepository(() => this.requireConnection(), vaultId),
    );
    this.notes = asNoteReader(
      new NoteRepository(() => this.requireConnection(), vaultId),
    );
    this.tags = asTagReader(
      new TagRepository(() => this.requireConnection(), vaultId),
    );
    this.favorites = asFavoriteReader(
      new FavoriteRepository(() => this.requireConnection(), vaultId),
    );
    const historyNotes = new NoteRepository(
      () => this.requireConnection(),
      vaultId,
    );
    this.history = asHistoryReader(
      new HistoryRepository(
        () => this.requireConnection(),
        vaultId,
        historyNotes,
      ),
    );
    const trashNotes = new NoteRepository(() => this.requireConnection(), vaultId);
    this.trash = asTrashReader(
      new TrashRepository(
        () => this.requireConnection(),
        vaultId,
        trashNotes,
      ),
    );
    this.attachments = asAttachmentReader(
      new AttachmentRepository(() => this.requireConnection(), vaultId),
    );
  }

  private requireConnection(): SqlcipherConnection {
    if (this.connection === undefined) {
      throw new StorageError('DATABASE_CLOSED');
    }
    return this.connection;
  }

  transaction<Result>(
    callback: (transaction: VaultTransaction) => Result,
  ): Result {
    const connection = this.requireConnection();
    if (this.transactionActive) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }

    let active = true;
    const guard = (): void => {
      if (!active) {
        throw new StorageError('STORAGE_OPERATION_FAILED');
      }
      this.requireConnection();
    };
    const noteWriter = new NoteRepository(
      () => this.requireConnection(),
      this.vaultId,
      guard,
    );
    const folderWriter = new FolderRepository(
      () => this.requireConnection(),
      this.vaultId,
      guard,
    );
    const tagWriter = new TagRepository(
      () => this.requireConnection(),
      this.vaultId,
      guard,
    );
    const transaction: VaultTransaction = {
      profileMetadata: new ProfileMetadataRepository(
        () => this.requireConnection(),
        this.vaultId,
        guard,
      ),
      folders: folderWriter,
      notes: noteWriter,
      tags: tagWriter,
      favorites: new FavoriteRepository(
        () => this.requireConnection(),
        this.vaultId,
        guard,
      ),
      history: new HistoryRepository(
        () => this.requireConnection(),
        this.vaultId,
        noteWriter,
        guard,
      ),
      trash: new TrashRepository(
        () => this.requireConnection(),
        this.vaultId,
        noteWriter,
        guard,
      ),
      contentPlans: new ContentPlanRepository(
        () => this.requireConnection(),
        this.vaultId,
        folderWriter,
        noteWriter,
        tagWriter,
        guard,
      ),
      attachments: new AttachmentRepository(
        () => this.requireConnection(), this.vaultId, guard,
      ),
    };

    this.transactionActive = true;
    try {
      return connection.transaction(() => {
        const result = callback(transaction);
        if (
          (typeof result === 'object' || typeof result === 'function') &&
          result !== null &&
          'then' in result &&
          typeof result.then === 'function'
        ) {
          throw new StorageError('STORAGE_OPERATION_FAILED');
        }
        return result;
      })();
    } finally {
      active = false;
      this.transactionActive = false;
    }
  }

  close(): void {
    if (this.transactionActive) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const connection = this.connection;
    if (connection === undefined) {
      return;
    }
    this.connection = undefined;
    connection.close();
  }
}

export function createVaultDatabase(
  options: CreateVaultDatabaseOptions,
): VaultDatabase {
  const connection = openNativeConnection({
    filePath: options.filePath,
    databaseKey: options.databaseKey,
    mode: 'CREATE',
  });

  try {
    connection.transaction(() => {
      createCurrentSchema(connection, {
        identity: options.identity,
        profileName: options.profileName,
        vaultMetaDigest: options.vaultMetaDigest,
        createdAt: Date.now(),
      });
    })();
    return new VaultDatabase(connection, options.identity.id);
  } catch (error) {
    closeAfterFailure(connection);
    removeCreatedDatabaseFiles(options.filePath);
    throw mapNativeError(error);
  }
}

export function openVaultDatabase(
  options: OpenVaultDatabaseOptions,
): VaultDatabase {
  const connection = openNativeConnection({
    filePath: options.filePath,
    databaseKey: options.databaseKey,
    mode: 'OPEN_EXISTING',
  });

  try {
    const schemaVersion = readSchemaVersion(connection);
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new StorageError('DB_SCHEMA_TOO_NEW');
    }
    if (schemaVersion < CURRENT_SCHEMA_VERSION) {
      runMigrations(
        connection,
        schemaVersion,
        CURRENT_SCHEMA_VERSION,
        PRODUCTION_MIGRATIONS,
      );
    }
    if (readSchemaVersion(connection) !== CURRENT_SCHEMA_VERSION) {
      throw new StorageError('DB_CORRUPT');
    }
    validateVaultMetadata(
      connection,
      options.expectedVaultId,
      options.expectedVaultMetaDigest,
    );
    return new VaultDatabase(connection, options.expectedVaultId);
  } catch (error) {
    closeAfterFailure(connection);
    throw mapNativeError(error);
  }
}
