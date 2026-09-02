import type {
  FolderId,
  TrashEntry,
  TrashEntryId,
  TrashPlan,
  Timestamp,
  VaultId,
} from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { insertNoteIndex } from '../search/index-writer';
import { hydrateTrashEntry, type TrashEntryRow } from '../serialization/rows';
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

interface TrashGroupRow {
  readonly id: string;
  readonly group_root_id: string;
  readonly object_type: 'NOTE' | 'FOLDER';
  readonly object_id: string;
  readonly original_parent_id: string;
}

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
    const row = this.connection()
      .prepare<TrashEntryRow>(
        `SELECT ${TRASH_COLUMNS} FROM trash_entries WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row ? hydrateTrashEntry(row) : undefined;
  }

  list(page: PageRequest): Page<TrashEntry> {
    this.guard();
    const cursor = parsePageRequest(
      page,
      TRASH_CURSOR,
      `vault:${this.vaultId}`,
    );
    const parameters: unknown[] = [this.vaultId];
    let keyset = '';
    if (cursor) {
      keyset = 'AND (deleted_at > ? OR (deleted_at = ? AND id > ?))';
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<TrashEntryRow>(
        `SELECT ${TRASH_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 't.$1')}
         FROM trash_entries t WHERE t.vault_id = ?
         AND t.id = t.group_root_id ${keyset}
       ORDER BY deleted_at, id LIMIT ?`,
      )
      .all(...parameters);
    const items = rows.slice(0, page.limit).map(hydrateTrashEntry);
    const last = items.at(-1);
    return {
      items,
      ...(rows.length > page.limit && last
        ? {
            nextCursor: encodeCursor(TRASH_CURSOR, `vault:${this.vaultId}`, {
              sortOrder: last.deletedAt,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  private topLevel(id: TrashEntryId): TrashEntry | undefined {
    const row = this.connection()
      .prepare<TrashEntryRow>(
        `SELECT ${TRASH_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 't.$1')}
         FROM trash_entries t WHERE t.id = ? AND t.vault_id = ?
         AND t.id = t.group_root_id`,
      )
      .get(id, this.vaultId);
    return row ? hydrateTrashEntry(row) : undefined;
  }

  listGroup(rootEntryId: TrashEntryId): readonly TrashEntry[] {
    this.guard();
    const root = this.topLevel(rootEntryId);
    if (root === undefined) return Object.freeze([]);
    const rows = this.connection()
      .prepare<TrashEntryRow>(
        `SELECT ${TRASH_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 't.$1')}
         FROM trash_entries t WHERE t.vault_id = ? AND t.group_root_id = ?
         ORDER BY t.deleted_at, t.id`,
      )
      .all(this.vaultId, root.id);
    return Object.freeze(rows.map(hydrateTrashEntry));
  }

  listExpiredGroups(now: Timestamp): readonly TrashEntry[] {
    this.guard();
    const roots = this.connection()
      .prepare<TrashEntryRow>(
        `SELECT ${TRASH_COLUMNS.replaceAll(/\b([a-z_]+)\b/g, 't.$1')}
         FROM trash_entries t WHERE t.vault_id = ? AND t.expires_at <= ?
         AND t.id = t.group_root_id ORDER BY t.deleted_at, t.id`,
      )
      .all(this.vaultId, now)
      .map(hydrateTrashEntry);
    return Object.freeze(roots.flatMap((root) => this.listGroup(root.id)));
  }

  private assertCompleteGroups(entries: readonly TrashEntry[]): void {
    if (entries.length === 0) return;
    const ids = new Set(entries.map(({ id }) => id));
    if (ids.size !== entries.length) relationViolation();
    const roots = entries.filter(({ id }) => this.topLevel(id) !== undefined);
    const expected = roots.flatMap(({ id }) => this.listGroup(id));
    if (
      roots.length === 0 ||
      expected.length !== entries.length ||
      expected.some(({ id }) => !ids.has(id))
    ) {
      relationViolation();
    }
    entries.forEach((entry) => {
      const stored = this.get(entry.id);
      if (
        stored === undefined ||
        stored.vaultId !== entry.vaultId ||
        stored.objectType !== entry.objectType ||
        stored.objectId !== entry.objectId ||
        stored.originalParentId !== entry.originalParentId ||
        stored.deletedAt !== entry.deletedAt ||
        stored.expiresAt !== entry.expiresAt
      ) {
        relationViolation();
      }
    });
  }

  private groupRoots(
    entries: readonly TrashEntry[],
  ): ReadonlyMap<TrashEntryId, TrashEntryId> {
    const folders = new Map(
      entries
        .filter(({ objectType }) => objectType === 'FOLDER')
        .map((entry) => [entry.objectId, entry]),
    );
    return new Map(
      entries.map((entry) => {
        const visited = new Set<TrashEntryId>([entry.id]);
        let root = entry;
        for (;;) {
          const parent = folders.get(root.originalParentId);
          if (parent === undefined) return [entry.id, root.id] as const;
          if (visited.has(parent.id)) relationViolation();
          visited.add(parent.id);
          root = parent;
        }
      }),
    );
  }

  apply(plan: TrashPlan): void {
    this.guard();
    const entryIds = new Set<string>();
    const groupRoots = this.groupRoots(plan.entries);
    plan.entries.forEach((entry) => {
      if (
        entry.vaultId !== this.vaultId ||
        entryIds.has(entry.id) ||
        this.get(entry.id)
      ) {
        relationViolation();
      }
      entryIds.add(entry.id);
      const row =
        entry.objectType === 'NOTE'
          ? this.connection()
              .prepare(
                'SELECT 1 AS found FROM notes WHERE id = ? AND vault_id = ?',
              )
              .get(entry.objectId, this.vaultId)
          : this.connection()
              .prepare<{
                kind: string;
              }>('SELECT kind FROM folders WHERE id = ? AND vault_id = ?')
              .get(entry.objectId, this.vaultId);
      if (!row || ('kind' in row && row.kind === 'ROOT')) relationViolation();
      const already = this.connection()
        .prepare(
          `SELECT 1 FROM trash_entries WHERE vault_id = ?
         AND object_type = ? AND object_id = ?`,
        )
        .get(this.vaultId, entry.objectType, entry.objectId);
      if (already) relationViolation();
    });
    plan.entries.forEach((entry) => {
      this.connection()
        .prepare(
          `INSERT INTO trash_entries(
           id, group_root_id, vault_id, object_type, object_id,
           original_parent_id, deleted_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          groupRoots.get(entry.id),
          entry.vaultId,
          entry.objectType,
          entry.objectId,
          entry.originalParentId,
          entry.deletedAt,
          entry.expiresAt,
        );
      if (entry.objectType === 'NOTE') {
        this.connection()
          .prepare('DELETE FROM notes_fts WHERE note_id = ?')
          .run(entry.objectId);
      }
    });
  }

  restore(input: TrashRestoreStoragePlan): void {
    this.guard();
    this.assertCompleteGroups(input.entries);
    const groupFolderIds = new Set(
      input.entries
        .filter(({ objectType }) => objectType === 'FOLDER')
        .map(({ objectId }) => objectId),
    );
    input.entries.forEach((entry) => {
      const stored = this.get(entry.id);
      const targetId = input.targetFolderIds.get(entry.id);
      if (!stored || !targetId || input.now >= stored.expiresAt)
        relationViolation();
      const target = groupFolderIds.has(targetId)
        ? { found: 1 }
        : this.connection()
            .prepare(
              `SELECT 1 FROM folders f WHERE f.id = ? AND f.vault_id = ?
               AND NOT EXISTS (SELECT 1 FROM trash_entries t
                 WHERE t.vault_id = f.vault_id AND t.object_type = 'FOLDER'
                   AND t.object_id = f.id)`,
            )
            .get(targetId, this.vaultId);
      if (!target) relationViolation();
    });
    const pendingFolders = input.entries.filter(
      ({ objectType }) => objectType === 'FOLDER',
    );
    const ordered: TrashEntry[] = [];
    while (pendingFolders.length > 0) {
      const pendingIds = new Set(
        pendingFolders.map(({ objectId }) => objectId),
      );
      const index = pendingFolders.findIndex((entry) => {
        const target = input.targetFolderIds.get(entry.id);
        return target !== undefined && !pendingIds.has(target);
      });
      if (index < 0) relationViolation();
      ordered.push(...pendingFolders.splice(index, 1));
    }
    ordered.push(
      ...input.entries.filter(({ objectType }) => objectType === 'NOTE'),
    );
    ordered.forEach((entry) => {
      const targetId = input.targetFolderIds.get(entry.id) as FolderId;
      if (entry.objectType === 'NOTE') {
        this.connection()
          .prepare(
            'UPDATE notes SET folder_id = ? WHERE id = ? AND vault_id = ?',
          )
          .run(targetId, entry.objectId, this.vaultId);
        const note = this.notes.get(entry.objectId);
        const row = this.connection()
          .prepare<{
            row_id: number | bigint;
          }>('SELECT row_id FROM notes WHERE id = ? AND vault_id = ?')
          .get(entry.objectId, this.vaultId);
        if (!note || !row) relationViolation();
        insertNoteIndex(this.connection(), row.row_id, note);
      } else {
        this.connection()
          .prepare(
            'UPDATE folders SET parent_id = ? WHERE id = ? AND vault_id = ?',
          )
          .run(targetId, entry.objectId, this.vaultId);
      }
      this.connection()
        .prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
        .run(entry.id, this.vaultId);
    });
  }

  private reparentIndependentGroups(
    entries: readonly TrashEntry[],
    folderIds: ReadonlySet<string>,
  ): void {
    if (folderIds.size === 0) return;
    const entryPlaceholders = entries.map(() => '?').join(', ');
    const stored = this.connection()
      .prepare<TrashGroupRow>(
        `SELECT id, group_root_id, object_type, object_id, original_parent_id
         FROM trash_entries WHERE vault_id = ?
           AND id IN (${entryPlaceholders})`,
      )
      .all(this.vaultId, ...entries.map(({ id }) => id));
    if (stored.length !== entries.length) relationViolation();
    const entriesById = new Map<string, TrashEntry>(
      entries.map((entry) => [entry.id, entry]),
    );
    const groupIds = new Set(stored.map(({ group_root_id }) => group_root_id));
    const fallbackByFolderId = new Map<string, FolderId>();
    stored.forEach((row) => {
      if (row.object_type !== 'FOLDER') return;
      const root = entriesById.get(row.group_root_id);
      if (root === undefined || root.objectType !== 'FOLDER') {
        relationViolation();
      }
      fallbackByFolderId.set(row.object_id, root.originalParentId);
    });
    const folderPlaceholders = [...folderIds].map(() => '?').join(', ');
    const groupPlaceholders = [...groupIds].map(() => '?').join(', ');
    const independentRoots = this.connection()
      .prepare<TrashGroupRow>(
        `SELECT id, group_root_id, object_type, object_id, original_parent_id
         FROM trash_entries WHERE vault_id = ? AND id = group_root_id
           AND group_root_id NOT IN (${groupPlaceholders})
           AND original_parent_id IN (${folderPlaceholders})`,
      )
      .all(this.vaultId, ...groupIds, ...folderIds);
    independentRoots.forEach((entry) => {
      const fallback = fallbackByFolderId.get(entry.original_parent_id);
      if (fallback === undefined) relationViolation();
      const result =
        entry.object_type === 'NOTE'
          ? this.connection()
              .prepare(
                'UPDATE notes SET folder_id = ? WHERE id = ? AND vault_id = ?',
              )
              .run(fallback, entry.object_id, this.vaultId)
          : this.connection()
              .prepare(
                'UPDATE folders SET parent_id = ? WHERE id = ? AND vault_id = ?',
              )
              .run(fallback, entry.object_id, this.vaultId);
      if (result.changes !== 1) relationViolation();
      const moved = this.connection()
        .prepare(
          `UPDATE trash_entries SET original_parent_id = ?
           WHERE id = ? AND vault_id = ?`,
        )
        .run(fallback, entry.id, this.vaultId);
      if (moved.changes !== 1) relationViolation();
    });
  }

  deletePermanent(entries: readonly TrashEntry[]): void {
    this.guard();
    const folderIds = new Set<string>(
      entries
        .filter(({ objectType }) => objectType === 'FOLDER')
        .map(({ objectId }) => objectId),
    );
    this.reparentIndependentGroups(entries, folderIds);
    this.assertCompleteGroups(entries);
    const noteIds = new Set<string>(
      entries
        .filter(({ objectType }) => objectType === 'NOTE')
        .map(({ objectId }) => objectId),
    );
    entries.forEach((entry) => {
      if (!this.get(entry.id) || entry.vaultId !== this.vaultId) {
        relationViolation();
      }
      if (entry.objectType === 'FOLDER') {
        const folder = this.connection()
          .prepare<{
            kind: string;
          }>('SELECT kind FROM folders WHERE id = ? AND vault_id = ?')
          .get(entry.objectId, this.vaultId);
        if (!folder || folder.kind === 'ROOT') relationViolation();
        const descendants = this.connection()
          .prepare<{ id: string }>(
            `WITH RECURSIVE subtree(id) AS (
             SELECT id FROM folders WHERE id = ? AND vault_id = ?
             UNION
             SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             WHERE f.vault_id = ?
           ) SELECT id FROM subtree`,
          )
          .all(entry.objectId, this.vaultId, this.vaultId);
        if (descendants.some(({ id }) => !folderIds.has(id)))
          relationViolation();
        const subtreeNotes = this.connection()
          .prepare<{ id: string }>(
            `WITH RECURSIVE subtree(id) AS (
             SELECT id FROM folders WHERE id = ? AND vault_id = ?
             UNION
             SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             WHERE f.vault_id = ?
           ) SELECT id FROM notes WHERE vault_id = ?
             AND folder_id IN (SELECT id FROM subtree)`,
          )
          .all(entry.objectId, this.vaultId, this.vaultId, this.vaultId);
        if (subtreeNotes.some(({ id }) => !noteIds.has(id)))
          relationViolation();
      }
    });
    entries
      .filter(({ objectType }) => objectType === 'NOTE')
      .forEach((entry) => {
        const id = entry.objectId;
        this.connection()
          .prepare(
            'DELETE FROM attachment_references WHERE vault_id = ? AND note_id = ?',
          )
          .run(this.vaultId, id);
        this.connection()
          .prepare('DELETE FROM note_tags WHERE vault_id = ? AND note_id = ?')
          .run(this.vaultId, id);
        this.connection()
          .prepare('DELETE FROM favorites WHERE vault_id = ? AND note_id = ?')
          .run(this.vaultId, id);
        this.connection()
          .prepare(
            'DELETE FROM note_versions WHERE vault_id = ? AND note_id = ?',
          )
          .run(this.vaultId, id);
        this.connection()
          .prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
          .run(entry.id, this.vaultId);
        this.connection()
          .prepare('DELETE FROM notes_fts WHERE note_id = ?')
          .run(id);
        this.connection()
          .prepare('DELETE FROM notes WHERE id = ? AND vault_id = ?')
          .run(id, this.vaultId);
      });
    entries
      .filter(({ objectType }) => objectType === 'FOLDER')
      .forEach((entry) => {
        this.connection()
          .prepare(
            'DELETE FROM attachment_references WHERE vault_id = ? AND trash_entry_id = ?',
          )
          .run(this.vaultId, entry.id);
        this.connection()
          .prepare('DELETE FROM trash_entries WHERE id = ? AND vault_id = ?')
          .run(entry.id, this.vaultId);
      });
    if (folderIds.size > 0) {
      const placeholders = [...folderIds].map(() => '?').join(', ');
      this.connection()
        .prepare(
          `DELETE FROM folders WHERE vault_id = ? AND id IN (${placeholders})`,
        )
        .run(this.vaultId, ...folderIds);
    }
  }

  purgeExpired(entries: readonly TrashEntry[]): void {
    this.deletePermanent(entries);
  }
}

export const asTrashReader = (repository: TrashRepository): TrashReader =>
  repository;
