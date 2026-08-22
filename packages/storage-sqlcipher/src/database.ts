import { rmSync } from 'node:fs';

import { openNativeConnection, type SqlcipherConnection } from './connection';
import { mapNativeError, StorageError } from './errors';
import { PRODUCTION_MIGRATIONS } from './migrations/registry';
import { runMigrations } from './migrations/runner';
import {
  createCurrentSchema,
  CURRENT_SCHEMA_VERSION,
} from './schema/current';
import { readSchemaVersion, validateVaultMetadata } from './schema/inspect';
import type {
  CreateVaultDatabaseOptions,
  OpenVaultDatabaseOptions,
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

  constructor(connection: SqlcipherConnection) {
    this.connection = connection;
  }

  close(): void {
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
    return new VaultDatabase(connection);
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
    return new VaultDatabase(connection);
  } catch (error) {
    closeAfterFailure(connection);
    throw mapNativeError(error);
  }
}
