import type { Migration, MigrationDatabase } from '../migrations/types';

const UUID_GLOB =
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-' +
  '[1-8][0-9a-f][0-9a-f][0-9a-f]-' +
  '[89ab][0-9a-f][0-9a-f][0-9a-f]-' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]' +
  '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]';

const uuid = (column: string) =>
  `typeof(${column}) = 'text' AND ${column} GLOB '${UUID_GLOB}'`;

interface LegacyTrashEntryRow {
  readonly id: string;
  readonly vault_id: string;
  readonly object_type: 'NOTE' | 'FOLDER';
  readonly object_id: string;
  readonly original_parent_id: string;
  readonly deleted_at: number;
  readonly expires_at: number;
}

interface TableInfoRow {
  readonly name: unknown;
  readonly type: unknown;
  readonly notnull: unknown;
}

function invalidMigration(): never {
  throw new Error('Invalid trash group migration.');
}

function inferGroupRoots(
  rows: readonly LegacyTrashEntryRow[],
): ReadonlyMap<string, string> {
  const folders = new Map(
    rows
      .filter(({ object_type }) => object_type === 'FOLDER')
      .map((entry) => [entry.object_id, entry]),
  );
  return new Map(
    rows.map((entry) => {
      const visited = new Set<string>([entry.id]);
      let root = entry;
      for (;;) {
        const parent = folders.get(root.original_parent_id);
        if (
          parent === undefined ||
          parent.vault_id !== entry.vault_id ||
          parent.deleted_at !== entry.deleted_at ||
          parent.expires_at !== entry.expires_at
        ) {
          return [entry.id, root.id] as const;
        }
        if (visited.has(parent.id)) invalidMigration();
        visited.add(parent.id);
        root = parent;
      }
    }),
  );
}

export const V7_TRASH_GROUP_ROOT: Migration = Object.freeze({
  targetVersion: 7,
  migrate(database: MigrationDatabase) {
    const rows = database
      .prepare<LegacyTrashEntryRow>(
        `SELECT id, vault_id, object_type, object_id, original_parent_id,
                deleted_at, expires_at
         FROM trash_entries ORDER BY id`,
      )
      .all();
    const groupRoots = inferGroupRoots(rows);
    database.exec(`
      CREATE TABLE trash_entries_v7(
        id TEXT PRIMARY KEY CHECK(${uuid('id')}),
        group_root_id TEXT NOT NULL CHECK(${uuid('group_root_id')}),
        vault_id TEXT NOT NULL CHECK(${uuid('vault_id')}),
        object_type TEXT NOT NULL CHECK(object_type IN ('NOTE', 'FOLDER')),
        object_id TEXT NOT NULL CHECK(${uuid('object_id')}),
        original_parent_id TEXT NOT NULL CHECK(${uuid('original_parent_id')}),
        deleted_at INTEGER NOT NULL
          CHECK(deleted_at >= 0 AND deleted_at <= 9007199254740991),
        expires_at INTEGER NOT NULL
          CHECK(expires_at >= deleted_at AND expires_at <= 9007199254740991),
        UNIQUE(vault_id, object_type, object_id)
      );
    `);
    const insert = database.prepare(
      `INSERT INTO trash_entries_v7(
         id, group_root_id, vault_id, object_type, object_id,
         original_parent_id, deleted_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    rows.forEach((row) => {
      const groupRootId = groupRoots.get(row.id);
      if (groupRootId === undefined) invalidMigration();
      insert.run(
        row.id,
        groupRootId,
        row.vault_id,
        row.object_type,
        row.object_id,
        row.original_parent_id,
        row.deleted_at,
        row.expires_at,
      );
    });
    database.exec(`
      DROP INDEX trash_entries_expiry;
      DROP TABLE trash_entries;
      ALTER TABLE trash_entries_v7 RENAME TO trash_entries;
      CREATE INDEX trash_entries_expiry
        ON trash_entries(vault_id, expires_at, id);
      CREATE INDEX trash_entries_group
        ON trash_entries(vault_id, group_root_id, deleted_at, id);
    `);
  },
  validate(database: MigrationDatabase) {
    const columns = database
      .prepare<TableInfoRow>("PRAGMA table_info('trash_entries')")
      .all()
      .filter(({ name }) => name === 'group_root_id');
    if (
      columns.length !== 1 ||
      columns[0].type !== 'TEXT' ||
      columns[0].notnull !== 1
    ) {
      invalidMigration();
    }
    const invalid = database
      .prepare(
        `SELECT 1 FROM trash_entries entry
         LEFT JOIN trash_entries root
           ON root.id = entry.group_root_id
          AND root.vault_id = entry.vault_id
         WHERE root.id IS NULL OR root.group_root_id <> root.id
         LIMIT 1`,
      )
      .get();
    if (invalid !== undefined) invalidMigration();
  },
});
