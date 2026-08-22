import { StorageError } from '../errors';
import { BASE_SCHEMA_VERSION } from '../schema/baseline-v1';
import { V2_PENDING_VAULT_META_DIGEST } from '../schema/v2';
import { V3_NOTE_VERSION_NAME } from '../schema/v3';
import { V4_NORMALIZED_ATTACHMENT_BLOBS } from '../schema/v4';
import type { Migration } from './types';

export const PRODUCTION_MIGRATIONS: readonly Migration[] = Object.freeze([
  V2_PENDING_VAULT_META_DIGEST,
  V3_NOTE_VERSION_NAME,
  V4_NORMALIZED_ATTACHMENT_BLOBS,
]);

export const CURRENT_SCHEMA_VERSION =
  PRODUCTION_MIGRATIONS.at(-1)?.targetVersion ?? BASE_SCHEMA_VERSION;

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

export function selectMigrationRange(
  migrations: readonly Migration[],
  baseVersion: number,
  fromVersion: number,
): readonly Migration[] {
  const registryCurrentVersion =
    migrations.at(-1)?.targetVersion ?? baseVersion;
  validateMigrationRegistry(migrations, baseVersion, registryCurrentVersion);
  if (
    !Number.isSafeInteger(fromVersion) ||
    fromVersion < baseVersion ||
    fromVersion > registryCurrentVersion
  ) {
    migrationFailure();
  }

  const selected = migrations.filter(
    (migration) =>
      migration.targetVersion > fromVersion &&
      migration.targetVersion <= registryCurrentVersion,
  );
  return validateMigrationRegistry(
    selected,
    fromVersion,
    registryCurrentVersion,
  );
}

export function selectProductionMigrations(
  fromVersion: number,
): readonly Migration[] {
  return selectMigrationRange(
    PRODUCTION_MIGRATIONS,
    BASE_SCHEMA_VERSION,
    fromVersion,
  );
}
