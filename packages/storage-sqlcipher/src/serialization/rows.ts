import { createHash } from 'node:crypto';

import {
  asFolderId,
  asFolderName,
  asSortOrder,
  asTimestamp,
  asVaultId,
  createRegularFolder,
  createRootFolder,
  type Folder,
  asContentVersion,
  asNoteId,
  asNoteVersionId,
  rehydrateNote,
  type Note,
  asTagId,
  asTagName,
  createFavorite,
  createNoteVersion,
  createTag,
  type Favorite,
  type NoteVersion,
  type Tag,
} from '@notera/domain';

import { StorageError } from '../errors';
import { parseAdf } from './adf-json';

export interface FolderRow {
  readonly id: unknown;
  readonly vault_id: unknown;
  readonly kind: unknown;
  readonly parent_id: unknown;
  readonly name: unknown;
  readonly sort_order: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export interface NoteRow {
  readonly row_id: unknown;
  readonly id: unknown;
  readonly vault_id: unknown;
  readonly folder_id: unknown;
  readonly title: unknown;
  readonly adf_json: unknown;
  readonly content_version: unknown;
  readonly sort_order: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export interface TagRow {
  readonly id: unknown;
  readonly vault_id: unknown;
  readonly name: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export interface FavoriteRow {
  readonly vault_id: unknown;
  readonly note_id: unknown;
  readonly sort_order: unknown;
  readonly created_at: unknown;
}

export interface NoteVersionRow {
  readonly id: unknown;
  readonly vault_id: unknown;
  readonly note_id: unknown;
  readonly kind: unknown;
  readonly protection_reason: unknown;
  readonly source_content_version: unknown;
  readonly title: unknown;
  readonly adf_json: unknown;
  readonly adf_bytes: unknown;
  readonly adf_sha256: unknown;
  readonly created_at: unknown;
}

export function hydrateFolder(row: FolderRow): Folder {
  try {
    const id = asFolderId(row.id);
    const vaultId = asVaultId(row.vault_id);
    const sortOrder = asSortOrder(row.sort_order);
    const createdAt = asTimestamp(row.created_at);
    const updatedAt = asTimestamp(row.updated_at);

    if (
      row.kind === 'ROOT' &&
      row.parent_id === null &&
      row.name === null &&
      sortOrder === 0 &&
      createdAt === updatedAt
    ) {
      return createRootFolder({ id, vaultId, createdAt });
    }
    if (
      row.kind === 'REGULAR' &&
      typeof row.parent_id === 'string' &&
      typeof row.name === 'string'
    ) {
      return createRegularFolder({
        id,
        vaultId,
        parentId: asFolderId(row.parent_id),
        name: asFolderName(row.name),
        sortOrder,
        createdAt,
        updatedAt,
      });
    }
  } catch {
    // All malformed persisted rows collapse to the stable corruption code.
  }
  throw new StorageError('DB_CORRUPT');
}

export function hydrateNote(row: NoteRow): Note {
  try {
    if (
      typeof row.title !== 'string' ||
      typeof row.adf_json !== 'string' ||
      (typeof row.row_id !== 'number' && typeof row.row_id !== 'bigint')
    ) {
      throw new Error('invalid note row');
    }
    return rehydrateNote({
      id: asNoteId(row.id),
      vaultId: asVaultId(row.vault_id),
      folderId: asFolderId(row.folder_id),
      title: row.title,
      document: parseAdf(row.adf_json),
      contentVersion: asContentVersion(row.content_version),
      sortOrder: asSortOrder(row.sort_order),
      createdAt: asTimestamp(row.created_at),
      updatedAt: asTimestamp(row.updated_at),
    });
  } catch {
    throw new StorageError('DB_CORRUPT');
  }
}

export function hydrateTag(row: TagRow): Tag {
  try {
    if (typeof row.name !== 'string') {
      throw new Error('invalid tag row');
    }
    return createTag({
      id: asTagId(row.id),
      vaultId: asVaultId(row.vault_id),
      name: asTagName(row.name),
      createdAt: asTimestamp(row.created_at),
      updatedAt: asTimestamp(row.updated_at),
    });
  } catch {
    throw new StorageError('DB_CORRUPT');
  }
}

export function hydrateFavorite(row: FavoriteRow): Favorite {
  try {
    return createFavorite({
      vaultId: asVaultId(row.vault_id),
      noteId: asNoteId(row.note_id),
      sortOrder: asSortOrder(row.sort_order),
      createdAt: asTimestamp(row.created_at),
    });
  } catch {
    throw new StorageError('DB_CORRUPT');
  }
}

export function hydrateNoteVersion(row: NoteVersionRow): NoteVersion {
  try {
    if (
      typeof row.title !== 'string' ||
      typeof row.adf_json !== 'string' ||
      typeof row.adf_bytes !== 'number' ||
      !Number.isSafeInteger(row.adf_bytes) ||
      !(row.adf_sha256 instanceof Uint8Array)
    ) {
      throw new Error('invalid history row');
    }
    const bytes = Buffer.from(row.adf_json, 'utf8');
    const digest = createHash('sha256').update(bytes).digest();
    if (
      bytes.byteLength !== row.adf_bytes ||
      row.adf_sha256.byteLength !== 32 ||
      !digest.equals(Buffer.from(row.adf_sha256))
    ) {
      throw new Error('history integrity mismatch');
    }
    return createNoteVersion({
      id: asNoteVersionId(row.id),
      vaultId: asVaultId(row.vault_id),
      noteId: asNoteId(row.note_id),
      kind: row.kind as NoteVersion['kind'],
      protectionReason: row.protection_reason as NoteVersion['protectionReason'],
      sourceContentVersion: asContentVersion(row.source_content_version),
      title: row.title,
      document: parseAdf(row.adf_json),
      createdAt: asTimestamp(row.created_at),
    } as NoteVersion);
  } catch {
    throw new StorageError('DB_CORRUPT');
  }
}
