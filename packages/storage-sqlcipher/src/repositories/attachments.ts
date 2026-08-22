import type { Attachment, AttachmentId, AttachmentReference, VaultId } from '@notera/domain';
import { asAttachmentByteLength, asAttachmentId, asBlobId, asTimestamp,
  asVaultId, createAttachment } from '@notera/domain';
import type { SqlcipherConnection } from '../connection';
import { StorageError } from '../errors';
import type { AttachmentReader, AttachmentWriter, StoredAttachment } from '../types';

type Provider = () => SqlcipherConnection;
const MAX_MANIFEST = 1024 * 1024;
function violation(): never { throw new StorageError('RELATION_INTEGRITY_VIOLATION'); }

export class AttachmentRepository implements AttachmentWriter {
  constructor(private readonly connection: Provider, private readonly vaultId: VaultId,
    private readonly guard: () => void = () => {}) {}

  get(id: AttachmentId): StoredAttachment | undefined {
    this.guard();
    const row = this.connection().prepare<Record<string, unknown>>(
      `SELECT id, blob_id, vault_id, file_name, mime_type, byte_length, local_state,
              file_key, manifest_version, manifest, created_at, updated_at
       FROM attachments WHERE id = ? AND vault_id = ?`,
    ).get(id, this.vaultId);
    if (!row) return undefined;
    try {
      if (typeof row.file_name !== 'string' || typeof row.mime_type !== 'string' ||
        typeof row.local_state !== 'string' || typeof row.manifest_version !== 'number' ||
        !(row.file_key instanceof Uint8Array) || !(row.manifest instanceof Uint8Array) ||
        row.file_key.byteLength !== 32 || row.manifest.byteLength > MAX_MANIFEST) throw new Error();
      return { attachment: createAttachment({ id: asAttachmentId(row.id), blobId: asBlobId(row.blob_id),
        vaultId: asVaultId(row.vault_id), fileName: row.file_name, mimeType: row.mime_type,
        byteLength: asAttachmentByteLength(row.byte_length), localState: row.local_state as Attachment['localState'],
        createdAt: asTimestamp(row.created_at), updatedAt: asTimestamp(row.updated_at) }),
      fileKey: Uint8Array.from(row.file_key), manifestVersion: row.manifest_version,
      manifest: Uint8Array.from(row.manifest) };
    } catch { throw new StorageError('DB_CORRUPT'); }
  }

  private validate(value: StoredAttachment): void {
    try { createAttachment(value.attachment); } catch { throw new StorageError('STORAGE_OPERATION_FAILED'); }
    if (value.attachment.vaultId !== this.vaultId || !(value.fileKey instanceof Uint8Array) ||
      value.fileKey.byteLength !== 32 || !Number.isSafeInteger(value.manifestVersion) ||
      value.manifestVersion < 1 || !(value.manifest instanceof Uint8Array) ||
      value.manifest.byteLength > MAX_MANIFEST) throw new StorageError('STORAGE_OPERATION_FAILED');
  }

  insert(value: StoredAttachment): void {
    this.guard(); this.validate(value); if (this.get(value.attachment.id)) violation();
    const a = value.attachment;
    this.connection().prepare(`INSERT INTO attachments(id, blob_id, vault_id, file_name,
      mime_type, byte_length, local_state, file_key, manifest_version, manifest, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.blobId, a.vaultId, a.fileName,
      a.mimeType, a.byteLength, a.localState, Buffer.from(value.fileKey), value.manifestVersion,
      Buffer.from(value.manifest), a.createdAt, a.updatedAt);
  }

  replace(value: StoredAttachment): void {
    this.guard(); this.validate(value); const current = this.get(value.attachment.id);
    if (!current || current.attachment.createdAt !== value.attachment.createdAt) violation();
    const a = value.attachment;
    this.connection().prepare(`UPDATE attachments SET blob_id=?, file_name=?, mime_type=?,
      byte_length=?, local_state=?, file_key=?, manifest_version=?, manifest=?, updated_at=?
      WHERE id=? AND vault_id=?`).run(a.blobId, a.fileName, a.mimeType, a.byteLength, a.localState,
      Buffer.from(value.fileKey), value.manifestVersion, Buffer.from(value.manifest), a.updatedAt,
      a.id, this.vaultId);
  }

  private source(reference: AttachmentReference): [string, string, string] {
    if (reference.source === 'NOTE') return ['note_id', 'notes', reference.noteId];
    if (reference.source === 'NOTE_VERSION') return ['note_version_id', 'note_versions', reference.noteVersionId];
    return ['trash_entry_id', 'trash_entries', reference.trashEntryId];
  }

  addReference(reference: AttachmentReference): void {
    this.guard(); const [column, table, id] = this.source(reference);
    if (reference.vaultId !== this.vaultId || !this.get(reference.attachmentId) ||
      !this.connection().prepare(`SELECT 1 FROM ${table} WHERE id=? AND vault_id=?`).get(id, this.vaultId)) violation();
    this.connection().prepare(`INSERT OR IGNORE INTO attachment_references(vault_id, attachment_id,
      source_type, ${column}) VALUES (?, ?, ?, ?)`).run(this.vaultId, reference.attachmentId,
      reference.source, id);
  }

  removeReference(reference: AttachmentReference): void {
    this.guard(); const [column, , id] = this.source(reference);
    this.connection().prepare(`DELETE FROM attachment_references WHERE vault_id=? AND attachment_id=?
      AND source_type=? AND ${column}=?`).run(this.vaultId, reference.attachmentId, reference.source, id);
  }

  markGcPending(attachment: Attachment): void {
    this.guard(); const current = this.get(attachment.id); if (!current || attachment.localState !== 'GC_PENDING') violation();
    const ref = this.connection().prepare('SELECT 1 FROM attachment_references WHERE vault_id=? AND attachment_id=? LIMIT 1')
      .get(this.vaultId, attachment.id); if (ref) violation();
    this.replace({ ...current, attachment });
  }
}
export const asAttachmentReader = (value: AttachmentRepository): AttachmentReader => value;
