import type { Folder, FolderId, Note, VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import {
  encodeCursor,
  encodeTextCursor,
  parsePageRequest,
  parseTextPageRequest,
} from '../cursor';
import { StorageError } from '../errors';
import {
  hydrateFolder,
  hydrateNote,
  type FolderRow,
  type NoteRow,
} from '../serialization/rows';
import type {
  ContentSort,
  FolderReader,
  FolderWriter,
  Page,
  PageRequest,
} from '../types';

const FOLDER_COLUMNS = `
  id, vault_id, kind, parent_id, name, sort_order, created_at, updated_at
`;
const CHILDREN_CURSOR_KIND = 'folders.children';
const CONTENT_CURSOR_KIND = 'folders.content';
const DEFAULT_CONTENT_SORT: ContentSort = Object.freeze({
  field: 'CREATED_AT',
  direction: 'DESC',
});

interface ContentRow {
  readonly entity_kind: 'FOLDER' | 'NOTE';
  readonly entity_id: string;
  readonly sort_order: number;
  readonly vault_id: string;
  readonly parent_or_folder_id: string;
  readonly name_or_title: string;
  readonly folder_kind: 'REGULAR' | null;
  readonly row_id: number | bigint | null;
  readonly adf_json: string | null;
  readonly content_version: number | null;
  readonly created_at: number;
  readonly updated_at: number;
}

type ConnectionProvider = () => SqlcipherConnection;
type UseGuard = () => void;

function relationViolation(): never {
  throw new StorageError('RELATION_INTEGRITY_VIOLATION');
}

function checkedContentSort(value: ContentSort | undefined): ContentSort {
  const sort = value ?? DEFAULT_CONTENT_SORT;
  if (
    (sort.field !== 'CREATED_AT' &&
      sort.field !== 'UPDATED_AT' &&
      sort.field !== 'TITLE') ||
    (sort.direction !== 'ASC' && sort.direction !== 'DESC')
  ) {
    throw new StorageError('INVALID_CURSOR');
  }
  return sort;
}

export class FolderRepository implements FolderWriter {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly guard: UseGuard = () => {},
  ) {}

  get(id: FolderId): Folder | undefined {
    this.guard();
    const row = this.connection()
      .prepare<FolderRow>(
        `SELECT ${FOLDER_COLUMNS} FROM folders
         WHERE id = ? AND vault_id = ?`,
      )
      .get(id, this.vaultId);
    return row === undefined ? undefined : hydrateFolder(row);
  }

  listAll(): readonly Folder[] {
    this.guard();
    return this.connection()
      .prepare<FolderRow>(
        `SELECT ${FOLDER_COLUMNS} FROM folders
         WHERE vault_id = ? ORDER BY created_at, id`,
      )
      .all(this.vaultId)
      .map(hydrateFolder);
  }

  listChildren(parentId: FolderId, page: PageRequest): Page<Folder> {
    this.guard();
    if (this.get(parentId) === undefined) {
      throw new StorageError('ENTITY_NOT_FOUND');
    }
    const fingerprint = `parent:${parentId}`;
    const cursor = parsePageRequest(page, CHILDREN_CURSOR_KIND, fingerprint);
    const parameters: unknown[] = [this.vaultId, parentId];
    let keyset = '';
    if (cursor !== undefined) {
      keyset = `AND (sort_order > ? OR (sort_order = ? AND id > ?))`;
      parameters.push(cursor.sortOrder, cursor.sortOrder, cursor.lastId);
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<FolderRow>(
        `SELECT ${FOLDER_COLUMNS} FROM folders
         WHERE vault_id = ? AND parent_id = ? ${keyset}
         ORDER BY sort_order, id LIMIT ?`,
      )
      .all(...parameters);
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map(hydrateFolder);
    const last = items.at(-1);
    return {
      items,
      ...(hasMore && last !== undefined
        ? {
            nextCursor: encodeCursor(CHILDREN_CURSOR_KIND, fingerprint, {
              sortOrder: last.sortOrder,
              lastId: last.id,
            }),
          }
        : {}),
    };
  }

  listSubtree(rootId: FolderId): readonly Folder[] {
    this.guard();
    if (this.get(rootId) === undefined) {
      throw new StorageError('ENTITY_NOT_FOUND');
    }
    return this.connection()
      .prepare<FolderRow>(
        `WITH RECURSIVE subtree(id) AS (
           SELECT id FROM folders WHERE id = ? AND vault_id = ?
           UNION
           SELECT child.id FROM folders child
           JOIN subtree parent ON child.parent_id = parent.id
           WHERE child.vault_id = ?
         )
         SELECT ${FOLDER_COLUMNS} FROM folders
         WHERE vault_id = ? AND id IN (SELECT id FROM subtree)
         ORDER BY created_at, id`,
      )
      .all(rootId, this.vaultId, this.vaultId, this.vaultId)
      .map(hydrateFolder);
  }

  listContent(
    folderId: FolderId,
    page: PageRequest,
    requestedSort?: ContentSort,
  ): Page<Folder | Note> {
    this.guard();
    if (this.get(folderId) === undefined) {
      throw new StorageError('ENTITY_NOT_FOUND');
    }
    const sort = checkedContentSort(requestedSort);
    const fingerprint = `folder:${folderId}:sort:${sort.field}:${sort.direction}`;
    const numericCursor =
      sort.field === 'TITLE'
        ? undefined
        : parsePageRequest(page, CONTENT_CURSOR_KIND, fingerprint);
    const textCursor =
      sort.field === 'TITLE'
        ? parseTextPageRequest(page, CONTENT_CURSOR_KIND, fingerprint)
        : undefined;
    const cursor = numericCursor ?? textCursor;
    if (
      cursor?.secondary !== undefined &&
      cursor.secondary !== 'FOLDER' &&
      cursor.secondary !== 'NOTE'
    ) {
      throw new StorageError('INVALID_CURSOR');
    }
    const sortColumn = {
      CREATED_AT: 'created_at',
      UPDATED_AT: 'updated_at',
      TITLE: 'name_or_title COLLATE NOCASE',
    }[sort.field];
    const comparison = sort.direction === 'ASC' ? '>' : '<';
    let keyset = '';
    const parameters: unknown[] = [
      this.vaultId,
      folderId,
      this.vaultId,
      this.vaultId,
      folderId,
      this.vaultId,
    ];
    if (cursor !== undefined) {
      if (cursor.secondary === undefined) {
        throw new StorageError('INVALID_CURSOR');
      }
      keyset = `WHERE (
        entity_kind > ?
        OR (
          entity_kind = ?
          AND (
            ${sortColumn} ${comparison} ?
            OR (${sortColumn} = ? AND entity_id > ?)
          )
        )
      )`;
      const cursorValue =
        'sortText' in cursor ? cursor.sortText : cursor.sortOrder;
      parameters.push(
        cursor.secondary,
        cursor.secondary,
        cursorValue,
        cursorValue,
        cursor.lastId,
      );
    }
    parameters.push(page.limit + 1);
    const rows = this.connection()
      .prepare<ContentRow>(
        `WITH content AS (
           SELECT 'FOLDER' AS entity_kind, f.id AS entity_id,
                  f.sort_order, f.vault_id,
                  f.parent_id AS parent_or_folder_id,
                  f.name AS name_or_title, f.kind AS folder_kind,
                  NULL AS row_id, NULL AS adf_json, NULL AS content_version,
                  f.created_at, f.updated_at
           FROM folders f
           WHERE f.vault_id = ? AND f.parent_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM trash_entries t
               WHERE t.vault_id = ? AND t.object_type = 'FOLDER'
                 AND t.object_id = f.id
             )
           UNION ALL
           SELECT 'NOTE', n.id, n.sort_order, n.vault_id, n.folder_id,
                  n.title, NULL, n.row_id, n.adf_json, n.content_version,
                  n.created_at, n.updated_at
           FROM notes n
           WHERE n.vault_id = ? AND n.folder_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM trash_entries t
               WHERE t.vault_id = ? AND t.object_type = 'NOTE'
                 AND t.object_id = n.id
             )
         )
         SELECT * FROM content ${keyset}
         ORDER BY entity_kind ASC, ${sortColumn} ${sort.direction}, entity_id ASC
         LIMIT ?`,
      )
      .all(...parameters);
    const hasMore = rows.length > page.limit;
    const items = rows.slice(0, page.limit).map((row): Folder | Note => {
      if (row.entity_kind === 'FOLDER') {
        return hydrateFolder({
          id: row.entity_id,
          vault_id: row.vault_id,
          kind: row.folder_kind,
          parent_id: row.parent_or_folder_id,
          name: row.name_or_title,
          sort_order: row.sort_order,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
      return hydrateNote({
        row_id: row.row_id,
        id: row.entity_id,
        vault_id: row.vault_id,
        folder_id: row.parent_or_folder_id,
        title: row.name_or_title,
        adf_json: row.adf_json,
        content_version: row.content_version,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as NoteRow);
    });
    const lastRow = rows[Math.min(rows.length, page.limit) - 1];
    return {
      items,
      ...(hasMore && lastRow
        ? {
            nextCursor:
              sort.field === 'TITLE'
                ? encodeTextCursor(CONTENT_CURSOR_KIND, fingerprint, {
                    sortText: lastRow.name_or_title,
                    secondary: lastRow.entity_kind,
                    lastId: lastRow.entity_id,
                  })
                : encodeCursor(CONTENT_CURSOR_KIND, fingerprint, {
                    sortOrder:
                      sort.field === 'CREATED_AT'
                        ? lastRow.created_at
                        : lastRow.updated_at,
                    secondary: lastRow.entity_kind,
                    lastId: lastRow.entity_id,
                  }),
          }
        : {}),
    };
  }

  private assertParentChain(folderId: FolderId, parentId: FolderId): void {
    const rows = this.connection()
      .prepare<{ id: string; kind: string }>(
        `WITH RECURSIVE ancestors(id, parent_id, kind) AS (
           SELECT id, parent_id, kind FROM folders
           WHERE id = ? AND vault_id = ?
           UNION
           SELECT parent.id, parent.parent_id, parent.kind
           FROM folders parent
           JOIN ancestors child ON child.parent_id = parent.id
           WHERE parent.vault_id = ?
         )
         SELECT id, kind FROM ancestors`,
      )
      .all(parentId, this.vaultId, this.vaultId);
    if (
      rows.length === 0 ||
      rows.some(({ id }) => id === folderId) ||
      rows.filter(({ kind }) => kind === 'ROOT').length !== 1
    ) {
      relationViolation();
    }
  }

  insert(folder: Folder): void {
    this.guard();
    if (
      folder.vaultId !== this.vaultId ||
      folder.kind === 'ROOT' ||
      this.get(folder.id) !== undefined
    ) {
      relationViolation();
    }
    this.assertParentChain(folder.id, folder.parentId);
    this.connection()
      .prepare(
        `INSERT INTO folders(
           id, vault_id, kind, parent_id, name, sort_order, created_at, updated_at
         ) VALUES (?, ?, 'REGULAR', ?, ?, ?, ?, ?)`,
      )
      .run(
        folder.id,
        folder.vaultId,
        folder.parentId,
        folder.name,
        folder.sortOrder,
        folder.createdAt,
        folder.updatedAt,
      );
  }

  replace(folder: Folder): void {
    this.guard();
    const existing = this.get(folder.id);
    if (
      existing === undefined ||
      existing.kind === 'ROOT' ||
      folder.kind === 'ROOT' ||
      folder.vaultId !== this.vaultId ||
      folder.createdAt !== existing.createdAt
    ) {
      relationViolation();
    }
    this.assertParentChain(folder.id, folder.parentId);
    const result = this.connection()
      .prepare(
        `UPDATE folders
         SET parent_id = ?, name = ?, sort_order = ?, updated_at = ?
         WHERE id = ? AND vault_id = ? AND kind = 'REGULAR'`,
      )
      .run(
        folder.parentId,
        folder.name,
        folder.sortOrder,
        folder.updatedAt,
        folder.id,
        this.vaultId,
      );
    if (result.changes !== 1) {
      relationViolation();
    }
  }

  replaceSortOrders(folders: readonly Folder[]): void {
    this.guard();
    const seen = new Set<FolderId>();
    folders.forEach((folder) => {
      const existing = this.get(folder.id);
      if (
        seen.has(folder.id) ||
        existing === undefined ||
        existing.kind === 'ROOT' ||
        folder.kind === 'ROOT' ||
        folder.vaultId !== this.vaultId ||
        folder.parentId !== existing.parentId ||
        folder.name !== existing.name ||
        folder.createdAt !== existing.createdAt
      ) {
        relationViolation();
      }
      seen.add(folder.id);
      const result = this.connection()
        .prepare(
          `UPDATE folders SET sort_order = ?, updated_at = ?
           WHERE id = ? AND vault_id = ? AND kind = 'REGULAR'`,
        )
        .run(folder.sortOrder, folder.updatedAt, folder.id, this.vaultId);
      if (result.changes !== 1) {
        relationViolation();
      }
    });
  }
}

export function asFolderReader(repository: FolderRepository): FolderReader {
  return repository;
}
