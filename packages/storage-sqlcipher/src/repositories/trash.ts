import type {
  FolderId,
  TrashEntry,
  TrashEntryId,
  TrashPlan,
  VaultId,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { insertNoteIndex } from '../search/index-writer';
import {
  hydrateTrashEntry,
  type TrashEntryRow,
} from '../serialization/rows';
import type {
  Page,
  PageRequest,
  TrashReader,
  TrashRestoreStoragePlan,
  TrashWriter,
} from '../types';
import type { NoteRepository } from './notes';

const TRASH_COLUMNS = `
  id, vault_id, object_type, object_id, original_parent_id, deleted_at, expires_at
`;
const TRASH_CURSOR = 'trash.list';
type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

export class TrashRepository implements TrashWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly notes: NoteRepository,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(id: TrashEntryId): TrashEntry | undefined {
    this.guard();
    const row = this.connection().prepare<TrashEntryRow>(
      `SELECT ${TRASH_COLUMNS} FROM trash_entries WHERE id = ? AND vault_id = ?`,
    ).get(id, this.vaultId);
    return row ? hydrateTrashEntry(row) : undefined;
  }

  list(page: PageRequest): Page<TrashEntry> {
    this.guard();
    const cursor = parsePageRequest(page, TRASH_CURSOR, `vault:${this.vaultId}`);
    const parameters: unknown[] = [this.vaultId];
    let keyset = '';
    if (cursor) {
      keyset = 'AND (deleted_at > ? OR (deleted_at = ? AND id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection().prepare<TrashEntryRow>(
      `SELECT ${TRASH_COLUMNS} FROM trash_entries WHERE vault_id = ? ${keyset}
       ORDER BY deleted_at, id LIMIT ?`,
    ).all(...parameters);
    const items = rows.slice(0, page.limit).map(hydrateTrashEntry);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > page.limit && last
        ? { nextCursor: encodeCursor(TRASH_CURSOR, `vault:${this.vaultId}`, {
            sortOrder: last.deletedAt,
            lastId: last.id,
          }) }
        : {}),
    };
  }

  apply(plan: TrashPlan): void {
    this.guard();
    const entryIds = new Set<string>();
    plan.entries.forEach((entry) => {
      if (entry.vaultId !== this.vaultId || entryIds.has(entry.id) || this.get(entry.id)) {
        relationViolation();
      }
      entryIds.add(entry.id);
      const row = entry.objectType === 'NOTE'
        ? this.connection().prepare(
            'SELECT 1 AS found FROM notes WHERE id = ? AND vault_id = ?',
          ).get(entry.objectId, this.vaultId)
        : this.connection().prepare<{ kind: string }>(
            'SELECT kind FROM folders WHERE id = ? AND vault_id = ?',
          ).get(entry.objectId, this.vaultId);
      if (!row || ('kind' in row && row.kind === 'ROOT')) relationViolation();
      const already = this.connection().prepare(
        `SELECT 1 FROM trash_entries WHERE vault_id = ?
         AND object_type = ? AND object_id = ?`,
      ).get(this.vaultId, entry.objectType, entry.objectId);
      if (already) relationViolation();
    });
    plan.entries.forEach((entry) => {
      this.connection().prepare(
        `INSERT INTO trash_entries(
           id, vault_id, object_type, object_id, original_parent_id,
           deleted_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(entry.id, entry.vaultId, entry.objectType, entry.objectId,
        entry.originalParentId, entry.deletedAt, entry.expiresAt);
      if (entry.objectType === 'NOTE') {
        this.connection().prepare('DELETE FROM notes_fts WHERE note_id = ?')
          .run(entry.objectId);
      }
    });
  }

  restore(input: TrashRestoreStoragePlan): void {
    this.guard();
    input.entries.forEach((entry) => {
      const stored = this.get(entry.id);
      const targetId = input.targetFolderIds.get(entry.id);
      if (!stored || !targetId || input.now >= stored.expiresAt) relationViolation();
      const target = this.connection().prepare(
        `SELECT 1 FROM folders f WHERE f.id = ? AND f.vault_id = ?
         AND NOT EXISTS (SELECT 1 FROM trash_entries t
           WHERE t.vault_id = f.vault_id AND t.object_type = 'FOLDER'
             AND t.object_id = f.id)`,
      ).get(targetId, this.vaultId);
      if (!target) relationViolation();
    });
    input.entries.forEach((entry) => {
      const targetId = input.targetFolderIds.get(entry.id) as FolderId;
      if (entry.objectType === 'NOTE') {
        this.connection().prepare('UPDATE notes SET folder_id = ? WHERE id = ? AND vault_id = ?')
          .run(targetId, entry.objectId, this.vaultId);
        const note = this.notes.get(entry.objectId);
        const row = this.connection().prepare<{ row_id: number | bigint }>(
          'SELECT row_id FROM notes WHERE id = ? AND vault_id = ?',
        ).get(entry.objectId, this.vaultId);
        if (!note || !row) relationViolation();
        insertNoteIndex(this.connection(), row.row_id, note);
      } else {
        this.connection().prepare('UPDATE folders SET parent_id = ? WHERE id = ? AND vault_id = ?')
          .run(targetId, entry.objectId, this.vaultId);
      }
      this.connection().prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
        .run(entry.id, this.vaultId);
    });
  }

  deletePermanent(entries: readonly TrashEntry[]): void {
    this.guard();
    const folderIds = new Set<string>(
      entries.filter(({ objectType }) => objectType === 'FOLDER').map(({ objectId }) => objectId),
    );
    const noteIds = new Set<string>(
      entries.filter(({ objectType }) => objectType === 'NOTE').map(({ objectId }) => objectId),
    );
    entries.forEach((entry) => {
      if (!this.get(entry.id) || entry.vaultId !== this.vaultId) {
        relationViolation();
      }
      if (entry.objectType === 'FOLDER') {
        const folder = this.connection().prepare<{ kind: string }>(
          'SELECT kind FROM folders WHERE id = ? AND vault_id = ?',
        ).get(entry.objectId, this.vaultId);
        if (!folder || folder.kind === 'ROOT') relationViolation();
        const descendants = this.connection().prepare<{ id: string }>(
          `WITH RECURSIVE subtree(id) AS (
             SELECT id FROM folders WHERE id = ? AND vault_id = ?
             UNION
             SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             WHERE f.vault_id = ?
           ) SELECT id FROM subtree`,
        ).all(entry.objectId, this.vaultId, this.vaultId);
        if (descendants.some(({ id }) => !folderIds.has(id))) relationViolation();
        const subtreeNotes = this.connection().prepare<{ id: string }>(
          `WITH RECURSIVE subtree(id) AS (
             SELECT id FROM folders WHERE id = ? AND vault_id = ?
             UNION
             SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             WHERE f.vault_id = ?
           ) SELECT id FROM notes WHERE vault_id = ?
             AND folder_id IN (SELECT id FROM subtree)`,
        ).all(entry.objectId, this.vaultId, this.vaultId, this.vaultId);
        if (subtreeNotes.some(({ id }) => !noteIds.has(id))) relationViolation();
      }
    });
    entries.filter(({ objectType }) => objectType === 'NOTE').forEach((entry) => {
      const id = entry.objectId;
      this.connection().prepare('DELETE FROM attachment_references WHERE vault_id = ? AND note_id = ?')
        .run(this.vaultId, id);
      this.connection().prepare('DELETE FROM note_tags WHERE vault_id = ? AND note_id = ?')
        .run(this.vaultId, id);
      this.connection().prepare('DELETE FROM favorites WHERE vault_id = ? AND note_id = ?')
        .run(this.vaultId, id);
      this.connection().prepare('DELETE FROM note_versions WHERE vault_id = ? AND note_id = ?')
        .run(this.vaultId, id);
      this.connection().prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
        .run(entry.id, this.vaultId);
      this.connection().prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
      this.connection().prepare('DELETE FROM notes WHERE id = ? AND vault_id = ?')
        .run(id, this.vaultId);
    });
    entries.filter(({ objectType }) => objectType === 'FOLDER').forEach((entry) => {
      this.connection().prepare(
        'DELETE FROM attachment_references WHERE vault_id = ? AND trash_entry_id = ?',
      ).run(this.vaultId, entry.id);
      this.connection().prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
        .run(entry.id, this.vaultId);
    });
    if (folderIds.size > 0) {
      const placeholders = [...folderIds].map(() => '?').join(', ');
      this.connection().prepare(
        `DELETE FROM folders WHERE vault_id = ? AND id IN (${placeholders})`,
      ).run(this.vaultId, ...folderIds);
    }
  }

  purgeExpired(entries: readonly TrashEntry[]): void {
    this.deletePermanent(entries);
  }
}

export const asTrashReader = (repository: TrashRepository): TrashReader => repository;
