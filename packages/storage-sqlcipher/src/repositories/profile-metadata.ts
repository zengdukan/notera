import type { VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import type {
  ProfileMetadata,
  ProfileMetadataReader,
  ProfileMetadataWriter,
} from '../types';

interface ProfileMetadataRow {
  readonly profile_name: unknown;
  readonly vault_meta_digest: unknown;
}

type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

export class ProfileMetadataRepository implements ProfileMetadataWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(): ProfileMetadata {
    this.guard();
    const rows = this.connection()
      .prepare<ProfileMetadataRow>(
        `SELECT profile_name, vault_meta_digest
         FROM vault_metadata WHERE singleton = 1 AND vault_id = ?`,
      )
      .all(this.vaultId);
    const row = rows[0];
    if (
      rows.length !== 1 ||
      typeof row.profile_name !== 'string' ||
      row.profile_name.trim().length === 0 ||
      !(row.vault_meta_digest instanceof Uint8Array) ||
      row.vault_meta_digest.byteLength !== 32
    ) {
      throw new StorageError('DB_CORRUPT');
    }
    return {
      profileName: row.profile_name,
      vaultMetaDigest: Uint8Array.from(row.vault_meta_digest),
    };
  }

  rename(profileName: string): void {
    this.guard();
    if (typeof profileName !== 'string' || profileName.trim().length === 0) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const result = this.connection()
      .prepare(
        `UPDATE vault_metadata SET profile_name = ?
         WHERE singleton = 1 AND vault_id = ?`,
      )
      .run(profileName, this.vaultId);
    if (result.changes !== 1) {
      throw new StorageError('DB_CORRUPT');
    }
  }

  replaceVaultMetaDigest(digest: Uint8Array): void {
    this.guard();
    if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const result = this.connection()
      .prepare(
        `UPDATE vault_metadata SET vault_meta_digest = ?
         WHERE singleton = 1 AND vault_id = ?`,
      )
      .run(Buffer.from(digest), this.vaultId);
    if (result.changes !== 1) {
      throw new StorageError('DB_CORRUPT');
    }
  }
}

export function asProfileMetadataReader(
  repository: ProfileMetadataRepository,
): ProfileMetadataReader {
  return repository;
}
