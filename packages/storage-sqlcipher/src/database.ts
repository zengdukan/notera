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
import {
  createCurrentSchema,
  CURRENT_SCHEMA_VERSION,
} from './schema/current';
import { readSchemaVersion, validateVaultMetadata } from './schema/inspect';
import type {
  CreateVaultDatabaseOptions,
  FolderReader,
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
    const transaction: VaultTransaction = {
      profileMetadata: new ProfileMetadataRepository(
        () => this.requireConnection(),
        this.vaultId,
        guard,
      ),
      folders: new FolderRepository(
        () => this.requireConnection(),
        this.vaultId,
        guard,
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
