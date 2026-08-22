import type { VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import type {
  ProfileMetadata,
  ProfileMetadataReader,
  ProfileMetadataWriter,
  VaultMetaDigestTransition,
} from '../types';

interface ProfileMetadataRow {
  readonly profile_name: unknown;
  readonly vault_meta_digest: unknown;
  readonly pending_vault_meta_digest: unknown;
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
    let rows: ProfileMetadataRow[];
    try {
      rows = this.connection()
        .prepare<ProfileMetadataRow>(
          `SELECT profile_name, vault_meta_digest, pending_vault_meta_digest
           FROM vault_metadata WHERE singleton = 1 AND vault_id = ?`,
        )
        .all(this.vaultId);
    } catch {
      throw new StorageError('DB_CORRUPT');
    }
    const row = rows[0];
    if (
      rows.length !== 1 ||
      typeof row.profile_name !== 'string' ||
      row.profile_name.trim().length === 0 ||
      !(row.vault_meta_digest instanceof Uint8Array) ||
      row.vault_meta_digest.byteLength !== 32 ||
      (row.pending_vault_meta_digest !== null &&
        (!(row.pending_vault_meta_digest instanceof Uint8Array) ||
          row.pending_vault_meta_digest.byteLength !== 32))
    ) {
      throw new StorageError('DB_CORRUPT');
    }
    const metadata: ProfileMetadata = {
      profileName: row.profile_name,
      vaultMetaDigest: Uint8Array.from(row.vault_meta_digest),
    };
    if (row.pending_vault_meta_digest instanceof Uint8Array) {
      return {
        ...metadata,
        pendingVaultMetaDigest: Uint8Array.from(
          row.pending_vault_meta_digest,
        ),
      };
    }
    return metadata;
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

  prepareVaultMetaDigest(input: VaultMetaDigestTransition): void {
    const { currentDigest, pendingDigest } = this.validateTransition(input);
    this.assertMetadataValid();
    const result = this.connection()
      .prepare(
        `UPDATE vault_metadata SET pending_vault_meta_digest = ?
         WHERE singleton = 1 AND vault_id = ?
           AND vault_meta_digest = ? AND pending_vault_meta_digest IS NULL`,
      )
      .run(pendingDigest, this.vaultId, currentDigest);
    this.assertTransitionApplied(result.changes);
  }

  finalizeVaultMetaDigest(input: VaultMetaDigestTransition): void {
    const { currentDigest, pendingDigest } = this.validateTransition(input);
    this.assertMetadataValid();
    const result = this.connection()
      .prepare(
        `UPDATE vault_metadata
         SET vault_meta_digest = ?, pending_vault_meta_digest = NULL
         WHERE singleton = 1 AND vault_id = ?
           AND vault_meta_digest = ? AND pending_vault_meta_digest = ?`,
      )
      .run(pendingDigest, this.vaultId, currentDigest, pendingDigest);
    this.assertTransitionApplied(result.changes);
  }

  cancelVaultMetaDigest(input: VaultMetaDigestTransition): void {
    const { currentDigest, pendingDigest } = this.validateTransition(input);
    this.assertMetadataValid();
    const result = this.connection()
      .prepare(
        `UPDATE vault_metadata SET pending_vault_meta_digest = NULL
         WHERE singleton = 1 AND vault_id = ?
           AND vault_meta_digest = ? AND pending_vault_meta_digest = ?`,
      )
      .run(this.vaultId, currentDigest, pendingDigest);
    this.assertTransitionApplied(result.changes);
  }

  private validateTransition(input: VaultMetaDigestTransition): {
    readonly currentDigest: Buffer;
    readonly pendingDigest: Buffer;
  } {
    this.guard();
    if (
      input === null ||
      typeof input !== 'object' ||
      !(input.currentDigest instanceof Uint8Array) ||
      input.currentDigest.byteLength !== 32 ||
      !(input.pendingDigest instanceof Uint8Array) ||
      input.pendingDigest.byteLength !== 32
    ) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    return {
      currentDigest: Buffer.from(input.currentDigest),
      pendingDigest: Buffer.from(input.pendingDigest),
    };
  }

  private assertMetadataValid(): void {
    this.get();
  }

  private assertTransitionApplied(changes: number): void {
    if (changes !== 1) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
  }
}

export function asProfileMetadataReader(
  repository: ProfileMetadataRepository,
): ProfileMetadataReader {
  return repository;
}
