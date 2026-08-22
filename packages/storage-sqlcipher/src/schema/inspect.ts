import { timingSafeEqual } from 'node:crypto';

import { asFolderId, asVaultId, type VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';

interface SchemaVersionRow {
  readonly schema_version: unknown;
}

interface VaultMetadataRow {
  readonly vault_id: unknown;
  readonly root_folder_id: unknown;
  readonly profile_name: unknown;
  readonly vault_meta_digest: unknown;
  readonly file_format_version: unknown;
}

function corrupt(): never {
  throw new StorageError('DB_CORRUPT');
}

export function readSchemaVersion(database: SqlcipherConnection): number {
  let rows: SchemaVersionRow[];
  try {
    rows = database
      .prepare<SchemaVersionRow>(
        'SELECT schema_version FROM schema_metadata WHERE singleton = 1',
      )
      .all();
  } catch {
    return corrupt();
  }

  if (
    rows.length !== 1 ||
    typeof rows[0].schema_version !== 'number' ||
    !Number.isSafeInteger(rows[0].schema_version) ||
    rows[0].schema_version < 1
  ) {
    return corrupt();
  }
  return rows[0].schema_version;
}

export function validateVaultMetadata(
  database: SqlcipherConnection,
  expectedVaultId: VaultId,
  expectedVaultMetaDigest: Uint8Array,
): void {
  if (expectedVaultMetaDigest.byteLength !== 32) {
    corrupt();
  }

  let rows: VaultMetadataRow[];
  try {
    rows = database
      .prepare<VaultMetadataRow>(
        `SELECT vault_id, root_folder_id, profile_name,
                vault_meta_digest, file_format_version
         FROM vault_metadata WHERE singleton = 1`,
      )
      .all();
  } catch {
    return corrupt();
  }
  if (rows.length !== 1) {
    corrupt();
  }

  const row = rows[0];
  try {
    const vaultId = asVaultId(row.vault_id);
    const rootFolderId = asFolderId(row.root_folder_id);
    if (
      vaultId !== expectedVaultId ||
      typeof row.profile_name !== 'string' ||
      row.profile_name.trim().length === 0 ||
      row.file_format_version !== 1 ||
      !(row.vault_meta_digest instanceof Uint8Array) ||
      row.vault_meta_digest.byteLength !== 32 ||
      !timingSafeEqual(
        Buffer.from(row.vault_meta_digest),
        Buffer.from(expectedVaultMetaDigest),
      )
    ) {
      corrupt();
    }

    const root = database
      .prepare<{ id: unknown }>(
        `SELECT id FROM folders
         WHERE id = ? AND vault_id = ? AND kind = 'ROOT'
           AND parent_id IS NULL AND name IS NULL`,
      )
      .get(rootFolderId, vaultId);
    if (root?.id !== rootFolderId) {
      corrupt();
    }
  } catch {
    corrupt();
  }
}
