import { createHash } from 'node:crypto';

import {
  asAttachmentByteLength,
  asAttachmentId,
  asBlobId,
  asTimestamp,
  asVaultId,
  createAttachment,
  type Attachment,
  type VaultId,
} from '@notera/domain';

import type { SqlcipherConnection } from './connection';
import { CURRENT_FILE_FORMAT_VERSION } from './file-format';
import { CURRENT_SCHEMA_VERSION } from './migrations/registry';
import { MAX_ATTACHMENT_MANIFEST_BYTES } from './repositories/attachments';
import { checkSearchIndex } from './search/health';
import { parseAdf } from './serialization/adf-json';
import {
  hydrateFavorite,
  hydrateFolder,
  hydrateNote,
  hydrateNoteVersion,
  hydrateTag,
  hydrateTrashEntry,
  type FavoriteRow,
  type FolderRow,
  type NoteRow,
  type NoteVersionRow,
  type TagRow,
  type TrashEntryRow,
} from './serialization/rows';
import type {
  IntegrityIssue,
  IntegrityIssueCode,
  IntegrityReport,
} from './types';

interface IdRow {
  readonly id: unknown;
}

interface FolderGraphRow {
  readonly id: unknown;
  readonly parent_id: unknown;
  readonly kind: unknown;
}

interface AttachmentRow extends Record<string, unknown> {
  readonly id: unknown;
}

const ENTITY_TABLES: readonly Readonly<{
  table: string;
  id: string;
}>[] = [
  { table: 'folders', id: 'id' },
  { table: 'notes', id: 'id' },
  { table: 'note_versions', id: 'id' },
  { table: 'tags', id: 'id' },
  { table: 'note_tags', id: 'note_id' },
  { table: 'favorites', id: 'note_id' },
  { table: 'trash_entries', id: 'id' },
  { table: 'attachments', id: 'id' },
  { table: 'attachment_references', id: 'attachment_id' },
];

function entityId(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

class IntegrityScanner {
  private readonly issues = new Map<string, IntegrityIssue>();

  constructor(
    private readonly database: SqlcipherConnection,
    private readonly vaultId: VaultId,
  ) {}

  private add(code: IntegrityIssueCode, table: string, id?: unknown): void {
    const normalizedId = entityId(id);
    const issue: IntegrityIssue = {
      code,
      table,
      ...(normalizedId === undefined ? {} : { entityId: normalizedId }),
    };
    this.issues.set(`${code}\u0000${table}\u0000${normalizedId ?? ''}`, issue);
  }

  private rows<Row>(sql: string, ...parameters: unknown[]): readonly Row[] {
    try {
      return this.database.prepare<Row>(sql).all(...parameters);
    } catch {
      this.add('SQLITE_INTEGRITY_FAILED', 'sqlite');
      return [];
    }
  }

  private sqliteIntegrity(): void {
    const rows = this.rows<Record<string, unknown>>('PRAGMA integrity_check');
    if (
      rows.length !== 1 ||
      Object.values(rows[0]).length !== 1 ||
      Object.values(rows[0])[0] !== 'ok'
    ) {
      this.add('SQLITE_INTEGRITY_FAILED', 'sqlite');
    }
  }

  private metadata(): string | undefined {
    const schema = this.rows<Record<string, unknown>>(
      'SELECT singleton, schema_version FROM schema_metadata',
    );
    const vault = this.rows<Record<string, unknown>>(
      `SELECT singleton, vault_id, root_folder_id, profile_name,
              vault_meta_digest, file_format_version
       FROM vault_metadata`,
    );
    const search = this.rows<Record<string, unknown>>(
      'SELECT singleton, normalizer_version, index_state FROM search_metadata',
    );
    if (
      schema.length !== 1 ||
      schema[0].singleton !== 1 ||
      schema[0].schema_version !== CURRENT_SCHEMA_VERSION
    ) {
      this.add('METADATA_INVALID', 'schema_metadata');
    }
    if (
      vault.length !== 1 ||
      vault[0].singleton !== 1 ||
      vault[0].vault_id !== this.vaultId ||
      typeof vault[0].root_folder_id !== 'string' ||
      typeof vault[0].profile_name !== 'string' ||
      vault[0].profile_name.trim().length === 0 ||
      !(vault[0].vault_meta_digest instanceof Uint8Array) ||
      vault[0].vault_meta_digest.byteLength !== 32 ||
      vault[0].file_format_version !== CURRENT_FILE_FORMAT_VERSION
    ) {
      this.add('METADATA_INVALID', 'vault_metadata');
      if (vault.length === 1 && vault[0].vault_id !== this.vaultId) {
        this.add('VAULT_MISMATCH', 'vault_metadata', vault[0].vault_id);
      }
    }
    if (
      search.length !== 1 ||
      search[0].singleton !== 1 ||
      typeof search[0].normalizer_version !== 'number' ||
      search[0].index_state !== 'READY'
    ) {
      this.add('METADATA_INVALID', 'search_metadata');
    }
    return vault.length === 1 && typeof vault[0].root_folder_id === 'string'
      ? vault[0].root_folder_id
      : undefined;
  }

  private vaultMismatches(): void {
    ENTITY_TABLES.forEach(({ table, id }) => {
      this.rows<Record<string, unknown>>(
        `SELECT ${id} AS id FROM ${table} WHERE vault_id != ? ORDER BY ${id}`,
        this.vaultId,
      ).forEach((row) => this.add('VAULT_MISMATCH', table, row.id));
    });
  }

  private folders(rootFolderId: string | undefined): void {
    const rows = this.rows<FolderRow & FolderGraphRow>(
      `SELECT id, vault_id, kind, parent_id, name, sort_order,
              created_at, updated_at
       FROM folders ORDER BY id`,
    );
    const currentRows = rows.filter((row) => row.vault_id === this.vaultId);
    currentRows.forEach((row) => {
      try {
        hydrateFolder(row);
      } catch {
        this.add('ENTITY_INVALID', 'folders', row.id);
      }
    });
    const roots = currentRows.filter((row) => row.kind === 'ROOT');
    if (
      roots.length !== 1 ||
      rootFolderId === undefined ||
      roots[0]?.id !== rootFolderId ||
      roots[0]?.parent_id !== null
    ) {
      this.add('ROOT_FOLDER_INVALID', 'folders', rootFolderId);
    }

    const parentById = new Map<string, string | null>();
    currentRows.forEach((row) => {
      if (typeof row.id === 'string') {
        parentById.set(
          row.id,
          typeof row.parent_id === 'string' ? row.parent_id : null,
        );
      }
    });
    currentRows.forEach((row) => {
      if (
        row.kind === 'REGULAR' &&
        typeof row.id === 'string' &&
        (typeof row.parent_id !== 'string' || !parentById.has(row.parent_id))
      ) {
        this.add('FOLDER_PARENT_MISSING', 'folders', row.id);
      }
    });

    const cycleIds = new Set<string>();
    parentById.forEach((_parent, start) => {
      const path: string[] = [];
      const pathIndex = new Map<string, number>();
      let current: string | null | undefined = start;
      while (
        current !== null &&
        current !== undefined &&
        parentById.has(current)
      ) {
        const repeatedAt = pathIndex.get(current);
        if (repeatedAt !== undefined) {
          path.slice(repeatedAt).forEach((id) => cycleIds.add(id));
          break;
        }
        pathIndex.set(current, path.length);
        path.push(current);
        current = parentById.get(current);
      }
    });
    [...cycleIds].forEach((id) => this.add('FOLDER_CYCLE', 'folders', id));
  }

  private notes(): void {
    this.rows<NoteRow>(
      `SELECT row_id, id, vault_id, folder_id, title, adf_json,
              content_version, sort_order, created_at, updated_at
       FROM notes ORDER BY id`,
    ).forEach((row) => {
      let adfValid = false;
      if (typeof row.adf_json === 'string') {
        try {
          parseAdf(row.adf_json);
          adfValid = true;
        } catch {
          this.add('ADF_INVALID', 'notes', row.id);
        }
      } else {
        this.add('ADF_INVALID', 'notes', row.id);
      }
      if (adfValid) {
        try {
          hydrateNote(row);
        } catch {
          this.add('ENTITY_INVALID', 'notes', row.id);
        }
      }
    });
    this.rows<IdRow>(
      `SELECT n.id FROM notes n
       LEFT JOIN folders f ON f.id = n.folder_id AND f.vault_id = n.vault_id
       WHERE n.vault_id = ? AND f.id IS NULL ORDER BY n.id`,
      this.vaultId,
    ).forEach((row) => this.add('RELATION_ORPHANED', 'notes', row.id));
  }

  private tagsAndFavorites(): void {
    this.rows<TagRow>(
      'SELECT id, vault_id, name, created_at, updated_at FROM tags ORDER BY id',
    ).forEach((row) => {
      try {
        hydrateTag(row);
      } catch {
        this.add('ENTITY_INVALID', 'tags', row.id);
      }
    });
    this.rows<FavoriteRow>(
      `SELECT vault_id, note_id, sort_order, created_at
       FROM favorites ORDER BY note_id`,
    ).forEach((row) => {
      try {
        hydrateFavorite(row);
      } catch {
        this.add('ENTITY_INVALID', 'favorites', row.note_id);
      }
    });
    this.relationOrphans(
      'note_tags',
      'nt.note_id',
      `FROM note_tags nt
       LEFT JOIN notes n ON n.id = nt.note_id AND n.vault_id = nt.vault_id
       LEFT JOIN tags t ON t.id = nt.tag_id AND t.vault_id = nt.vault_id
       WHERE nt.vault_id = ? AND (n.id IS NULL OR t.id IS NULL)`,
    );
    this.relationOrphans(
      'favorites',
      'f.note_id',
      `FROM favorites f
       LEFT JOIN notes n ON n.id = f.note_id AND n.vault_id = f.vault_id
       WHERE f.vault_id = ? AND n.id IS NULL`,
    );
  }

  private history(): void {
    this.rows<NoteVersionRow>(
      `SELECT id, vault_id, note_id, kind, protection_reason,
              source_content_version, title, adf_json, adf_bytes,
              adf_sha256, created_at
       FROM note_versions ORDER BY id`,
    ).forEach((row) => {
      let contentValid = true;
      if (typeof row.adf_json !== 'string') {
        contentValid = false;
        this.add('ADF_INVALID', 'note_versions', row.id);
      } else {
        try {
          parseAdf(row.adf_json);
        } catch {
          contentValid = false;
          this.add('ADF_INVALID', 'note_versions', row.id);
        }
        const bytes = Buffer.from(row.adf_json, 'utf8');
        const digest = createHash('sha256').update(bytes).digest();
        if (
          row.adf_bytes !== bytes.byteLength ||
          !(row.adf_sha256 instanceof Uint8Array) ||
          row.adf_sha256.byteLength !== 32 ||
          !digest.equals(Buffer.from(row.adf_sha256))
        ) {
          contentValid = false;
          this.add('HISTORY_HASH_MISMATCH', 'note_versions', row.id);
        }
      }
      if (contentValid) {
        try {
          hydrateNoteVersion(row);
        } catch {
          this.add('ENTITY_INVALID', 'note_versions', row.id);
        }
      }
    });
    this.relationOrphans(
      'note_versions',
      'v.id',
      `FROM note_versions v
       LEFT JOIN notes n ON n.id = v.note_id AND n.vault_id = v.vault_id
       WHERE v.vault_id = ? AND n.id IS NULL`,
    );
  }

  private trash(): void {
    this.rows<TrashEntryRow>(
      `SELECT id, vault_id, object_type, object_id, original_parent_id,
              deleted_at, expires_at
       FROM trash_entries ORDER BY id`,
    ).forEach((row) => {
      try {
        hydrateTrashEntry(row);
      } catch {
        this.add('ENTITY_INVALID', 'trash_entries', row.id);
      }
    });
    this.relationOrphans(
      'trash_entries',
      't.id',
      `FROM trash_entries t
       LEFT JOIN folders parent
         ON parent.id = t.original_parent_id AND parent.vault_id = t.vault_id
       LEFT JOIN notes n
         ON t.object_type = 'NOTE' AND n.id = t.object_id
        AND n.vault_id = t.vault_id
       LEFT JOIN folders f
         ON t.object_type = 'FOLDER' AND f.id = t.object_id
        AND f.vault_id = t.vault_id
       WHERE t.vault_id = ? AND (
         parent.id IS NULL OR
         (t.object_type = 'NOTE' AND n.id IS NULL) OR
         (t.object_type = 'FOLDER' AND f.id IS NULL)
       )`,
    );
  }

  private attachments(): void {
    this.rows<AttachmentRow>(
      `SELECT id, blob_id, vault_id, file_name, mime_type, byte_length,
              local_state, file_key, manifest_version, manifest,
              created_at, updated_at
       FROM attachments ORDER BY id`,
    ).forEach((row) => {
      try {
        if (
          typeof row.file_name !== 'string' ||
          typeof row.mime_type !== 'string' ||
          typeof row.local_state !== 'string' ||
          typeof row.manifest_version !== 'number' ||
          !Number.isSafeInteger(row.manifest_version) ||
          row.manifest_version < 1 ||
          !(row.file_key instanceof Uint8Array) ||
          row.file_key.byteLength !== 32 ||
          !(row.manifest instanceof Uint8Array) ||
          row.manifest.byteLength > MAX_ATTACHMENT_MANIFEST_BYTES
        ) {
          throw new Error('invalid attachment bytes');
        }
        createAttachment({
          id: asAttachmentId(row.id),
          blobId: asBlobId(row.blob_id),
          vaultId: asVaultId(row.vault_id),
          fileName: row.file_name,
          mimeType: row.mime_type,
          byteLength: asAttachmentByteLength(row.byte_length),
          localState: row.local_state as Attachment['localState'],
          createdAt: asTimestamp(row.created_at),
          updatedAt: asTimestamp(row.updated_at),
        });
      } catch {
        this.add('ATTACHMENT_METADATA_INVALID', 'attachments', row.id);
      }
    });
    this.relationOrphans(
      'attachment_references',
      'r.attachment_id',
      `FROM attachment_references r
       LEFT JOIN attachments a
         ON a.id = r.attachment_id AND a.vault_id = r.vault_id
       LEFT JOIN notes n
         ON r.source_type = 'NOTE' AND n.id = r.note_id
        AND n.vault_id = r.vault_id
       LEFT JOIN note_versions v
         ON r.source_type = 'NOTE_VERSION' AND v.id = r.note_version_id
        AND v.vault_id = r.vault_id
       LEFT JOIN trash_entries t
         ON r.source_type = 'TRASH' AND t.id = r.trash_entry_id
        AND t.vault_id = r.vault_id
       WHERE r.vault_id = ? AND (
         a.id IS NULL OR
         (r.source_type = 'NOTE' AND n.id IS NULL) OR
         (r.source_type = 'NOTE_VERSION' AND v.id IS NULL) OR
         (r.source_type = 'TRASH' AND t.id IS NULL)
       )`,
    );
  }

  private relationOrphans(
    table: string,
    idExpression: string,
    fromAndWhere: string,
  ): void {
    this.rows<IdRow>(
      `SELECT ${idExpression} AS id ${fromAndWhere} ORDER BY id`,
      this.vaultId,
    ).forEach((row) => this.add('RELATION_ORPHANED', table, row.id));
  }

  scan(): IntegrityReport {
    this.sqliteIntegrity();
    const rootFolderId = this.metadata();
    this.vaultMismatches();
    this.folders(rootFolderId);
    this.notes();
    this.tagsAndFavorites();
    this.history();
    this.trash();
    this.attachments();
    try {
      if (!checkSearchIndex(this.database, this.vaultId).ok) {
        this.add('SEARCH_INDEX_INVALID', 'notes_fts');
      }
    } catch {
      this.add('SEARCH_INDEX_INVALID', 'notes_fts');
    }
    const issues = [...this.issues.values()].sort((left, right) =>
      `${left.code}:${left.table}:${left.entityId ?? ''}`.localeCompare(
        `${right.code}:${right.table}:${right.entityId ?? ''}`,
      ),
    );
    return { ok: issues.length === 0, issues };
  }
}

export function checkIntegrity(
  database: SqlcipherConnection,
  vaultId: VaultId,
): IntegrityReport {
  return new IntegrityScanner(database, vaultId).scan();
}
