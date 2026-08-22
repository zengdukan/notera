import type { AttachmentBlob, BlobId, VaultId } from '@notera/domain';
import {
  asAttachmentByteLength,
  asBlobId,
  asTimestamp,
  asVaultId,
  createAttachmentBlob,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import type { StoredAttachmentBlob } from '../types';

export const MAX_ATTACHMENT_MANIFEST_BYTES = 1024 * 1024;

type Provider = () => SqlcipherConnection;
type Row = Record<string, unknown>;

function corrupt(): never {
  throw new StorageError('DB_CORRUPT');
}

function hydrateBlob(row: Row): AttachmentBlob {
  try {
    const digest = row.content_sha256;
    if (
      digest !== null &&
      (!(digest instanceof Uint8Array) || digest.byteLength !== 32)
    ) {
      return corrupt();
    }
    return createAttachmentBlob({
      id: asBlobId(row.blob_id),
      vaultId: asVaultId(row.vault_id),
      ...(digest === null ? {} : { contentSha256: digest }),
      byteLength: asAttachmentByteLength(row.byte_length),
      localState: row.local_state as AttachmentBlob['localState'],
      createdAt: asTimestamp(row.created_at),
      updatedAt: asTimestamp(row.updated_at),
    });
  } catch (error) {
    if (error instanceof StorageError) throw error;
    return corrupt();
  }
}

function hydrateStored(row: Row): StoredAttachmentBlob {
  if (
    !(row.file_key instanceof Uint8Array) ||
    row.file_key.byteLength !== 32 ||
    typeof row.manifest_version !== 'number' ||
    !Number.isSafeInteger(row.manifest_version) ||
    row.manifest_version < 1 ||
    !(row.manifest instanceof Uint8Array) ||
    row.manifest.byteLength > MAX_ATTACHMENT_MANIFEST_BYTES
  ) {
    return corrupt();
  }
  return Object.freeze({
    blob: hydrateBlob(row),
    fileKey: Uint8Array.from(row.file_key),
    manifestVersion: row.manifest_version,
    manifest: Uint8Array.from(row.manifest),
  });
}

const BLOB_COLUMNS = `
  blob_id, vault_id, content_sha256, byte_length, local_state,
  file_key, manifest_version, manifest, created_at, updated_at
`;

export class AttachmentBlobRepository {
  constructor(
    private readonly connection: Provider,
    private readonly vaultId: VaultId,
    private readonly guard: () => void = () => {},
  ) {}

  get(id: BlobId): StoredAttachmentBlob | undefined {
    this.guard();
    const row = this.connection()
      .prepare<Row>(
        `SELECT ${BLOB_COLUMNS} FROM attachment_blobs
         WHERE blob_id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row === undefined ? undefined : hydrateStored(row);
  }

  findReadyBySha256(value: Uint8Array): StoredAttachmentBlob | undefined {
    this.guard();
    if (!(value instanceof Uint8Array) || value.byteLength !== 32) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const row = this.connection()
      .prepare<Row>(
        `SELECT ${BLOB_COLUMNS} FROM attachment_blobs
         WHERE vault_id = ? AND content_sha256 = ? AND local_state = 'READY'`,
      )
      .get(this.vaultId, Buffer.from(value));
    return row === undefined ? undefined : hydrateStored(row);
  }

  listAll(): readonly AttachmentBlob[] {
    this.guard();
    return Object.freeze(
      this.connection()
        .prepare<Row>(
          `SELECT ${BLOB_COLUMNS} FROM attachment_blobs
           WHERE vault_id = ? ORDER BY blob_id`,
        )
        .all(this.vaultId)
        .map(hydrateBlob),
    );
  }

  listGcPending(): readonly AttachmentBlob[] {
    this.guard();
    return Object.freeze(
      this.connection()
        .prepare<Row>(
          `SELECT ${BLOB_COLUMNS} FROM attachment_blobs
           WHERE vault_id = ? AND local_state = 'GC_PENDING'
           ORDER BY blob_id`,
        )
        .all(this.vaultId)
        .map(hydrateBlob),
    );
  }

  private validate(value: StoredAttachmentBlob): void {
    let blob: AttachmentBlob;
    try {
      blob = createAttachmentBlob(value.blob);
    } catch {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    if (
      blob.vaultId !== this.vaultId ||
      !(value.fileKey instanceof Uint8Array) ||
      value.fileKey.byteLength !== 32 ||
      !Number.isSafeInteger(value.manifestVersion) ||
      value.manifestVersion < 1 ||
      !(value.manifest instanceof Uint8Array) ||
      value.manifest.byteLength > MAX_ATTACHMENT_MANIFEST_BYTES
    ) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
  }

  insert(value: StoredAttachmentBlob): void {
    this.guard();
    this.validate(value);
    const { blob } = value;
    this.connection()
      .prepare(
        `INSERT INTO attachment_blobs(
           blob_id, vault_id, content_sha256, byte_length, local_state,
           file_key, manifest_version, manifest, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        blob.id,
        blob.vaultId,
        blob.contentSha256 === undefined
          ? null
          : Buffer.from(blob.contentSha256),
        blob.byteLength,
        blob.localState,
        Buffer.from(value.fileKey),
        value.manifestVersion,
        Buffer.from(value.manifest),
        blob.createdAt,
        blob.updatedAt,
      );
  }

  replace(value: StoredAttachmentBlob): void {
    this.guard();
    this.validate(value);
    const current = this.get(value.blob.id);
    if (
      current === undefined ||
      current.blob.createdAt !== value.blob.createdAt
    ) {
      throw new StorageError('RELATION_INTEGRITY_VIOLATION');
    }
    const { blob } = value;
    this.connection()
      .prepare(
        `UPDATE attachment_blobs SET
           content_sha256 = ?, byte_length = ?, local_state = ?, file_key = ?,
           manifest_version = ?, manifest = ?, updated_at = ?
         WHERE blob_id = ? AND vault_id = ?`,
      )
      .run(
        blob.contentSha256 === undefined
          ? null
          : Buffer.from(blob.contentSha256),
        blob.byteLength,
        blob.localState,
        Buffer.from(value.fileKey),
        value.manifestVersion,
        Buffer.from(value.manifest),
        blob.updatedAt,
        blob.id,
        this.vaultId,
      );
  }
}
