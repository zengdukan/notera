import type {
  Attachment,
  AttachmentId,
  AttachmentReference,
  BlobId,
  NoteId,
  NoteVersionId,
  Timestamp,
  TrashEntryId,
  VaultId,
} from '@notera/domain';
import {
  asAttachmentId,
  asBlobId,
  asNoteId,
  asNoteVersionId,
  asTimestamp,
  asTrashEntryId,
  asVaultId,
  createAttachment,
  createAttachmentBlob,
  createCurrentNoteAttachmentReference,
  createNoteVersionAttachmentReference,
  createTrashAttachmentReference,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import type {
  AttachmentListItem,
  AttachmentReader,
  AttachmentWriter,
  Page,
  PageRequest,
  StoredAttachmentBlob,
  StoredAttachmentContent,
} from '../types';
import { AttachmentBlobRepository } from './attachment-blobs';

type Provider = () => SqlcipherConnection;
type Row = Record<string, unknown>;
const LIST_CURSOR = 'attachments.for-note';

function violation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

function corrupt(): never {
  throw new StorageError('DB_CORRUPT');
}

function hydrateAttachment(row: Row): Attachment {
  try {
    if (typeof row.file_name !== 'string' || typeof row.mime_type !== 'string') {
      return corrupt();
    }
    return createAttachment({
      id: asAttachmentId(row.id),
      blobId: asBlobId(row.blob_id),
      vaultId: asVaultId(row.vault_id),
      fileName: row.file_name,
      mimeType: row.mime_type,
      createdAt: asTimestamp(row.created_at),
    });
  } catch (error) {
    if (error instanceof StorageError) throw error;
    return corrupt();
  }
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

export class AttachmentRepository implements AttachmentWriter {
  private readonly blobs: AttachmentBlobRepository;

  constructor(
    private readonly connection: Provider,
    private readonly vaultId: VaultId,
    private readonly guard: () => void = () => {},
  ) {
    this.blobs = new AttachmentBlobRepository(connection, vaultId, guard);
  }

  getAttachment(id: AttachmentId): Attachment | undefined {
    this.guard();
    const row = this.connection()
      .prepare<Row>(
        `SELECT id, blob_id, vault_id, file_name, mime_type, created_at
         FROM attachments WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row === undefined ? undefined : hydrateAttachment(row);
  }

  getBlob(id: BlobId): StoredAttachmentBlob | undefined {
    return this.blobs.get(id);
  }

  getContent(id: AttachmentId): StoredAttachmentContent | undefined {
    const attachment = this.getAttachment(id);
    if (attachment === undefined) return undefined;
    const storedBlob = this.blobs.get(attachment.blobId);
    if (storedBlob === undefined) return corrupt();
    return Object.freeze({ attachment, storedBlob });
  }

  findReadyBlobBySha256(value: Uint8Array): StoredAttachmentBlob | undefined {
    return this.blobs.findReadyBySha256(value);
  }

  listForNote(noteId: NoteId, page: PageRequest): Page<AttachmentListItem> {
    this.guard();
    const cursor = parsePageRequest(page, LIST_CURSOR, `note:${noteId}`);
    const params: unknown[] = [this.vaultId, noteId];
    let keyset = '';
    if (cursor !== undefined) {
      keyset = 'AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))';
      params.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    params.push(page.limit + 1);
    const rows = this.connection()
      .prepare<Row>(
        `SELECT a.id, a.blob_id, a.vault_id, a.file_name, a.mime_type,
                a.created_at
         FROM attachment_references r
         JOIN attachments a
           ON a.id = r.attachment_id AND a.vault_id = r.vault_id
         WHERE r.vault_id = ? AND r.source_type = 'NOTE' AND r.note_id = ?
         ${keyset}
         ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      )
      .all(...params);
    const items = rows.slice(0, page.limit).map((row) => {
      const attachment = hydrateAttachment(row);
      const storedBlob = this.blobs.get(attachment.blobId);
      if (storedBlob === undefined) return corrupt();
      return Object.freeze({ attachment, blob: storedBlob.blob });
    });
    const last = items.at(-1);
    return Object.freeze({
      items: Object.freeze(items),
      ...(rows.length > page.limit && last !== undefined
        ? {
            nextCursor: encodeCursor(LIST_CURSOR, `note:${noteId}`, {
              sortOrder: last.attachment.createdAt,
              lastId: last.attachment.id,
            }),
          }
        : {}),
    });
  }

  private listReferences(
    column: 'note_id' | 'note_version_id' | 'trash_entry_id' | 'attachment_id',
    ids: readonly string[],
  ): readonly AttachmentReference[] {
    this.guard();
    const unique = [...new Set(ids)];
    if (unique.length === 0) return Object.freeze([]);
    const rows = this.connection()
      .prepare<Row>(
        `SELECT vault_id, attachment_id, source_type,
                note_id, note_version_id, trash_entry_id
         FROM attachment_references
         WHERE vault_id = ? AND ${column} IN (${placeholders(unique)})
         ORDER BY attachment_id, source_type, note_id, note_version_id,
                  trash_entry_id`,
      )
      .all(this.vaultId, ...unique);
    return Object.freeze(
      rows.map((row) => {
        try {
          const base = {
            vaultId: asVaultId(row.vault_id),
            attachmentId: asAttachmentId(row.attachment_id),
          };
          if (row.source_type === 'NOTE') {
            return createCurrentNoteAttachmentReference({
              ...base,
              noteId: asNoteId(row.note_id),
            });
          }
          if (row.source_type === 'NOTE_VERSION') {
            return createNoteVersionAttachmentReference({
              ...base,
              noteVersionId: asNoteVersionId(row.note_version_id),
            });
          }
          if (row.source_type === 'TRASH') {
            return createTrashAttachmentReference({
              ...base,
              trashEntryId: asTrashEntryId(row.trash_entry_id),
            });
          }
          return corrupt();
        } catch (error) {
          if (error instanceof StorageError) throw error;
          return corrupt();
        }
      }),
    );
  }

  listReferencesForNotes(ids: readonly NoteId[]) {
    return this.listReferences('note_id', ids).filter(
      (value) => value.source === 'NOTE',
    );
  }

  listReferencesForVersions(ids: readonly NoteVersionId[]) {
    return this.listReferences('note_version_id', ids).filter(
      (value) => value.source === 'NOTE_VERSION',
    );
  }

  listReferencesForTrashEntries(ids: readonly TrashEntryId[]) {
    return this.listReferences('trash_entry_id', ids).filter(
      (value) => value.source === 'TRASH',
    );
  }

  listReferencesForAttachments(ids: readonly AttachmentId[]) {
    return this.listReferences('attachment_id', ids);
  }

  listAllBlobs() {
    return this.blobs.listAll();
  }

  listGcPendingBlobs() {
    return this.blobs.listGcPending();
  }

  insertBlob(value: StoredAttachmentBlob): void {
    this.blobs.insert(value);
  }

  insertAttachment(value: Attachment): void {
    this.guard();
    let attachment: Attachment;
    try {
      attachment = createAttachment(value);
    } catch {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const blob = this.blobs.get(attachment.blobId);
    if (
      attachment.vaultId !== this.vaultId ||
      blob === undefined ||
      blob.blob.vaultId !== attachment.vaultId ||
      this.getAttachment(attachment.id) !== undefined
    ) {
      return violation();
    }
    this.connection()
      .prepare(
        `INSERT INTO attachments(
           id, blob_id, vault_id, file_name, mime_type, created_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attachment.id,
        attachment.blobId,
        attachment.vaultId,
        attachment.fileName,
        attachment.mimeType,
        attachment.createdAt,
      );
  }

  replaceBlob(value: StoredAttachmentBlob): void {
    this.blobs.replace(value);
  }

  private owner(reference: AttachmentReference): [string, string, string] {
    if (reference.source === 'NOTE') {
      return ['note_id', 'notes', reference.noteId];
    }
    if (reference.source === 'NOTE_VERSION') {
      return ['note_version_id', 'note_versions', reference.noteVersionId];
    }
    return ['trash_entry_id', 'trash_entries', reference.trashEntryId];
  }

  addReferences(values: readonly AttachmentReference[]): void {
    this.guard();
    values.forEach((reference) => {
      const [column, table, ownerId] = this.owner(reference);
      if (
        reference.vaultId !== this.vaultId ||
        this.getAttachment(reference.attachmentId) === undefined ||
        this.connection()
          .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND vault_id = ?`)
          .get(ownerId, this.vaultId) === undefined
      ) {
        return violation();
      }
      this.connection()
        .prepare(
          `INSERT OR IGNORE INTO attachment_references(
             vault_id, attachment_id, source_type, ${column}
           ) VALUES (?, ?, ?, ?)`,
        )
        .run(
          this.vaultId,
          reference.attachmentId,
          reference.source,
          ownerId,
        );
    });
  }

  removeReferences(values: readonly AttachmentReference[]): void {
    this.guard();
    values.forEach((reference) => {
      const [column, , ownerId] = this.owner(reference);
      this.connection()
        .prepare(
          `DELETE FROM attachment_references
           WHERE vault_id = ? AND attachment_id = ? AND source_type = ?
             AND ${column} = ?`,
        )
        .run(
          this.vaultId,
          reference.attachmentId,
          reference.source,
          ownerId,
        );
    });
  }

  replaceNoteReferences(
    noteId: NoteId,
    values: readonly Extract<AttachmentReference, { source: 'NOTE' }>[],
  ): void {
    this.guard();
    if (
      values.some(
        (reference) =>
          reference.noteId !== noteId || reference.vaultId !== this.vaultId,
      )
    ) {
      return violation();
    }
    this.connection()
      .prepare(
        `DELETE FROM attachment_references
         WHERE vault_id = ? AND source_type = 'NOTE' AND note_id = ?`,
      )
      .run(this.vaultId, noteId);
    this.addReferences(values);
  }

  deleteUnreferencedAttachments(
    ids: readonly AttachmentId[],
    now: Timestamp,
  ): readonly BlobId[] {
    this.guard();
    const pending = new Set<BlobId>();
    [...new Set(ids)].forEach((id) => {
      const attachment = this.getAttachment(id);
      if (attachment === undefined) return;
      const referenced = this.connection()
        .prepare(
          `SELECT 1 FROM attachment_references
           WHERE vault_id = ? AND attachment_id = ? LIMIT 1`,
        )
        .get(this.vaultId, id);
      if (referenced !== undefined) return;
      this.connection()
        .prepare('DELETE FROM attachments WHERE id = ? AND vault_id = ?')
        .run(id, this.vaultId);
      const remaining = this.connection()
        .prepare(
          `SELECT 1 FROM attachments
           WHERE vault_id = ? AND blob_id = ? LIMIT 1`,
        )
        .get(this.vaultId, attachment.blobId);
      if (remaining !== undefined) return;
      const stored = this.blobs.get(attachment.blobId);
      if (stored === undefined) return corrupt();
      this.blobs.replace({
        ...stored,
        blob: createAttachmentBlob({
          ...stored.blob,
          localState: 'GC_PENDING',
          updatedAt: now,
        }),
      });
      pending.add(attachment.blobId);
    });
    return Object.freeze([...pending].sort());
  }

  finalizeGc(blobId: BlobId): void {
    this.guard();
    const stored = this.blobs.get(blobId);
    if (stored === undefined) return;
    const remaining = this.connection()
      .prepare(
        `SELECT 1 FROM attachments
         WHERE vault_id = ? AND blob_id = ? LIMIT 1`,
      )
      .get(this.vaultId, blobId);
    if (stored.blob.localState !== 'GC_PENDING' || remaining !== undefined) {
      return violation();
    }
    this.connection()
      .prepare(
        `DELETE FROM attachment_blobs
         WHERE blob_id = ? AND vault_id = ? AND local_state = 'GC_PENDING'`,
      )
      .run(blobId, this.vaultId);
  }
}

export const asAttachmentReader = (
  value: AttachmentRepository,
): AttachmentReader => value;
