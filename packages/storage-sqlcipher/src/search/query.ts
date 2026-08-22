import type { FolderId, VaultId } from '@notera/domain';

import type { SqlcipherConnection } from '../connection';
import { encodeCursor, parsePageRequest } from '../cursor';
import { StorageError } from '../errors';
import { parseAdf } from '../serialization/adf-json';
import type {
  Page,
  PageRequest,
  SearchHit,
  SearchReader,
  SearchScope,
} from '../types';
import { createSearchPresentation } from './excerpt';
import { NORMALIZER_VERSION, normalizeSearchText } from './normalize';

const SEARCH_CURSOR_KIND = 'search.results';

interface SearchRow {
  readonly note_id: string;
  readonly title: string;
  readonly adf_json: string;
  readonly updated_at: number;
  readonly title_match: number;
  readonly relevance: number;
}

type ConnectionProvider = () => SqlcipherConnection;

function invalidCursor(): never {
  throw new StorageError('INVALID_CURSOR');
}

function unavailable(): never {
  throw new StorageError('SEARCH_INDEX_UNAVAILABLE');
}

function escapeLike(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function ftsLiteral(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function scopeFingerprint(scope: SearchScope): string {
  return scope.kind === 'VAULT' ? 'vault' : `folder:${scope.folderId}`;
}

function cursorSecondary(row: SearchRow): string {
  return JSON.stringify([row.title_match, row.relevance]);
}

export class SearchRepository implements SearchReader {
  constructor(
    private readonly connection: ConnectionProvider,
    private readonly vaultId: VaultId,
    private readonly rebuilding: () => boolean,
  ) {}

  private assertReady(): void {
    if (this.rebuilding()) {
      unavailable();
    }
    const rows = this.connection()
      .prepare<{ normalizer_version: unknown; index_state: unknown }>(
        `SELECT normalizer_version, index_state
         FROM search_metadata WHERE singleton = 1`,
      )
      .all();
    if (
      rows.length !== 1 ||
      rows[0].normalizer_version !== NORMALIZER_VERSION ||
      rows[0].index_state !== 'READY'
    ) {
      unavailable();
    }
  }

  private assertActiveFolder(folderId: FolderId): void {
    const found = this.connection()
      .prepare(
        `SELECT 1 AS found FROM folders f
         WHERE f.id = ? AND f.vault_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trash_entries t
             WHERE t.vault_id = f.vault_id
               AND t.object_type = 'FOLDER' AND t.object_id = f.id
           )`,
      )
      .get(folderId, this.vaultId);
    if (found === undefined) {
      throw new StorageError('ENTITY_NOT_FOUND');
    }
  }

  private rows(
    normalizedQuery: string,
    scope: SearchScope,
  ): readonly SearchRow[] {
    const useFts = Array.from(normalizedQuery).length >= 3;
    const titleExpression = 'instr(notes_fts.normalized_title, ?) > 0';
    const predicate = useFts
      ? 'notes_fts MATCH ?'
      : `(notes_fts.normalized_title LIKE ? ESCAPE '\\'
          OR notes_fts.normalized_body LIKE ? ESCAPE '\\')`;
    const relevance = useFts ? 'bm25(notes_fts)' : '0.0';
    const queryValue = useFts
      ? ftsLiteral(normalizedQuery)
      : `%${escapeLike(normalizedQuery)}%`;
    const predicateParameters = useFts
      ? [queryValue]
      : [queryValue, queryValue];
    const activePredicate = `NOT EXISTS (
      SELECT 1 FROM trash_entries trashed
      WHERE trashed.vault_id = ? AND trashed.object_type = 'NOTE'
        AND trashed.object_id = n.id
    )`;

    if (
      scope.kind === 'VAULT' ||
      (scope.kind === 'FOLDER_SUBTREE' &&
        scope.folderId === this.rootFolderId())
    ) {
      return this.connection()
        .prepare<SearchRow>(
          `SELECT n.id AS note_id, n.title, n.adf_json, n.updated_at,
                  ${titleExpression} AS title_match,
                  ${relevance} AS relevance
           FROM notes_fts JOIN notes n ON n.row_id = notes_fts.rowid
           WHERE n.vault_id = ? AND ${activePredicate} AND ${predicate}
           ORDER BY title_match DESC, relevance, n.updated_at DESC, n.id`,
        )
        .all(
          normalizedQuery,
          this.vaultId,
          this.vaultId,
          ...predicateParameters,
        );
    }

    return this.connection()
      .prepare<SearchRow>(
        `WITH RECURSIVE folder_scope(folder_id) AS (
           SELECT ?
           UNION
           SELECT child.id FROM folders child
           JOIN folder_scope parent ON child.parent_id = parent.folder_id
           WHERE child.vault_id = ?
         )
         SELECT n.id AS note_id, n.title, n.adf_json, n.updated_at,
                ${titleExpression} AS title_match,
                ${relevance} AS relevance
         FROM notes_fts JOIN notes n ON n.row_id = notes_fts.rowid
         JOIN folder_scope ON folder_scope.folder_id = n.folder_id
         WHERE n.vault_id = ? AND ${activePredicate} AND ${predicate}
         ORDER BY title_match DESC, relevance, n.updated_at DESC, n.id`,
      )
      .all(
        scope.folderId,
        this.vaultId,
        normalizedQuery,
        this.vaultId,
        this.vaultId,
        ...predicateParameters,
      );
  }

  private rootFolderId(): string {
    const row = this.connection()
      .prepare<{
        root_folder_id: string;
      }>('SELECT root_folder_id FROM vault_metadata WHERE singleton = 1')
      .get();
    return row?.root_folder_id ?? '';
  }

  query(query: string, scope: SearchScope, page: PageRequest): Page<SearchHit> {
    this.assertReady();
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    if (scope.kind !== 'VAULT' && scope.kind !== 'FOLDER_SUBTREE') {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    if (scope.kind === 'FOLDER_SUBTREE') {
      this.assertActiveFolder(scope.folderId);
    }

    const normalizedQuery = normalizeSearchText(query.trim()).text;
    if (normalizedQuery.length === 0) {
      throw new StorageError('STORAGE_OPERATION_FAILED');
    }
    const fingerprint = `${JSON.stringify(normalizedQuery)}:${scopeFingerprint(scope)}`;
    const cursor = parsePageRequest(page, SEARCH_CURSOR_KIND, fingerprint);
    const rows = this.rows(normalizedQuery, scope);
    let start = 0;
    if (cursor !== undefined) {
      if (cursor.secondary === undefined) {
        invalidCursor();
      }
      const cursorIndex = rows.findIndex(
        (row) =>
          row.note_id === cursor.lastId &&
          row.updated_at === cursor.sortOrder &&
          cursorSecondary(row) === cursor.secondary,
      );
      if (cursorIndex < 0) {
        invalidCursor();
      }
      start = cursorIndex + 1;
    }
    const selected = rows.slice(start, start + page.limit + 1);
    const hasMore = selected.length > page.limit;
    const pageRows = selected.slice(0, page.limit);
    const items = pageRows.map((row): SearchHit => {
      const presentation = createSearchPresentation(
        row.title,
        parseAdf(row.adf_json),
        normalizedQuery,
      );
      return {
        noteId: row.note_id as SearchHit['noteId'],
        title: row.title,
        excerpt: presentation.excerpt,
        updatedAt: row.updated_at as SearchHit['updatedAt'],
        highlights: presentation.highlights,
      };
    });
    const last = pageRows.at(-1);
    return {
      items,
      ...(hasMore && last !== undefined
        ? {
            nextCursor: encodeCursor(SEARCH_CURSOR_KIND, fingerprint, {
              sortOrder: last.updated_at,
              lastId: last.note_id,
              secondary: cursorSecondary(last),
            }),
          }
        : {}),
    };
  }
}
