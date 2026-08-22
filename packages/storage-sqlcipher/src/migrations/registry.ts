import { StorageError } from '../errors';
import type { Migration } from './types';

export const PRODUCTION_MIGRATIONS: readonly Migration[] = Object.freeze([]);

function migrationFailure(): never {
  throw new StorageError('MIGRATION_FAILED');
}

export function validateMigrationRegistry(
  migrations: readonly Migration[],
  fromVersion: number,
  targetVersion: number,
): readonly Migration[] {
  if (
    !Number.isSafeInteger(fromVersion) ||
    !Number.isSafeInteger(targetVersion) ||
    fromVersion < 0 ||
    targetVersion < fromVersion ||
    migrations.length !== targetVersion - fromVersion
  ) {
    return migrationFailure();
  }

  migrations.forEach((migration, index) => {
    if (migration.targetVersion !== fromVersion + index + 1) {
      migrationFailure();
    }
  });
  return migrations;
}
