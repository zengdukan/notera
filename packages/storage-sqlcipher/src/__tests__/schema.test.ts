import { existsSync, renameSync } from 'node:fs';

import type { VaultId } from '@notera/domain';

import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  fileHash,
  openTestConnection,
  OTHER_VAULT_ID,
  tempDatabasePath,
  TEST_IDENTITY,
  TEST_ROOT_FOLDER_ID,
  TEST_VAULT_ID,
  vaultMetaDigest,
} from './helpers';

interface VaultDatabaseHandle {
  close(): void;
}

interface DatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: typeof TEST_IDENTITY;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): VaultDatabaseHandle;
  openVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    expectedVaultId: VaultId;
    expectedVaultMetaDigest: Uint8Array;
  }): VaultDatabaseHandle;
}

function databaseModule(): DatabaseModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as DatabaseModule;
}

function expectStorageCode(operation: () => unknown, code: string): void {
  try {
    operation();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as StorageError).code).toBe(code);
  }
}

afterEach(cleanupTempDatabases);

describe('vault schema v1', () => {
  it('creates the complete metadata, domain, index, and trigram schema', () => {
    const filePath = tempDatabasePath();
    const vault = databaseModule().createVaultDatabase({
      filePath,
      databaseKey: databaseKey(),
      identity: TEST_IDENTITY,
      profileName: '真实 Profile 名称',
      vaultMetaDigest: vaultMetaDigest(),
    });
    vault.close();

    const connection = openTestConnection(filePath);
    const objects = connection
      .prepare<{ type: string; name: string; sql: string | null }>(
        `SELECT type, name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%' ORDER BY name`,
      )
      .all();
    const tableNames = objects
      .filter(({ type }) => type === 'table')
      .map(({ name }) => name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'schema_metadata',
        'vault_metadata',
        'search_metadata',
        'folders',
        'notes',
        'note_versions',
        'tags',
        'note_tags',
        'favorites',
        'trash_entries',
        'attachments',
        'attachment_references',
        'notes_fts',
      ]),
    );
    expect(objects.some(({ type }) => type === 'index')).toBe(true);

    const schemaSql = objects.map(({ sql }) => sql ?? '').join('\n');
    expect(schemaSql).not.toMatch(/\bFOREIGN\s+KEY\b/i);
    expect(schemaSql).not.toMatch(/\bREFERENCES\b/i);
    expect(schemaSql).toMatch(/length\s*\(\s*file_key\s*\)\s*=\s*32/i);
    expect(schemaSql).toMatch(/length\s*\(\s*manifest\s*\)\s*<=\s*1048576/i);
    expect(schemaSql).toMatch(/tokenize\s*=\s*'trigram'/i);
    expect(connection.pragma('foreign_keys', { simple: true })).toBe(0);

    expect(
      connection.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 1 });
    expect(
      connection
        .prepare(
          `SELECT vault_id, root_folder_id, profile_name,
                  length(vault_meta_digest) AS digest_bytes
           FROM vault_metadata`,
        )
        .get(),
    ).toEqual({
      vault_id: TEST_VAULT_ID,
      root_folder_id: TEST_ROOT_FOLDER_ID,
      profile_name: '真实 Profile 名称',
      digest_bytes: 32,
    });
    expect(
      connection
        .prepare(
          `SELECT id, vault_id, kind, parent_id, name, sort_order
           FROM folders WHERE kind = 'ROOT'`,
        )
        .get(),
    ).toEqual({
      id: TEST_ROOT_FOLDER_ID,
      vault_id: TEST_VAULT_ID,
      kind: 'ROOT',
      parent_id: null,
      name: null,
      sort_order: 0,
    });

    expect(() =>
      connection
        .prepare(
          `INSERT INTO folders(
             id, vault_id, kind, parent_id, name, sort_order,
             created_at, updated_at
           ) VALUES (?, ?, 'REGULAR', ?, 'Invalid UUID', 0, 1, 1)`,
        )
        .run(
          'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
          TEST_VAULT_ID,
          TEST_ROOT_FOLDER_ID,
        ),
    ).toThrow();

    connection.exec(
      `INSERT INTO notes_fts(
         rowid, note_id, source_content_version, normalized_title, normalized_body
       ) VALUES (1, 'note', 1, 'notera title', 'encrypted body')`,
    );
    expect(
      connection
        .prepare(`SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?`)
        .get('ote'),
    ).toEqual({ note_id: 'note' });
    connection.close();
  });

  it('opens only when schema and vault identity metadata are valid', () => {
    const filePath = tempDatabasePath();
    databaseModule()
      .createVaultDatabase({
        filePath,
        databaseKey: databaseKey(),
        identity: TEST_IDENTITY,
        profileName: 'Profile',
        vaultMetaDigest: vaultMetaDigest(),
      })
      .close();

    databaseModule()
      .openVaultDatabase({
        filePath,
        databaseKey: databaseKey(),
        expectedVaultId: TEST_VAULT_ID,
        expectedVaultMetaDigest: vaultMetaDigest(),
      })
      .close();

    const before = fileHash(filePath);
    expectStorageCode(
      () =>
        databaseModule().openVaultDatabase({
          filePath,
          databaseKey: databaseKey(),
          expectedVaultId: OTHER_VAULT_ID,
          expectedVaultMetaDigest: vaultMetaDigest(),
        }),
      'DB_CORRUPT',
    );
    expectStorageCode(
      () =>
        databaseModule().openVaultDatabase({
          filePath,
          databaseKey: databaseKey(),
          expectedVaultId: TEST_VAULT_ID,
          expectedVaultMetaDigest: vaultMetaDigest(102),
        }),
      'DB_CORRUPT',
    );
    expect(fileHash(filePath)).toBe(before);

    const renamed = `${filePath}.renamed`;
    renameSync(filePath, renamed);
    expect(existsSync(renamed)).toBe(true);
  });

  it('rejects missing, invalid, and newer schema metadata safely', () => {
    const scenarios = [
      'DROP TABLE schema_metadata',
      `DROP TABLE schema_metadata;
       CREATE TABLE schema_metadata(schema_version TEXT);
       INSERT INTO schema_metadata VALUES ('invalid')`,
      'UPDATE schema_metadata SET schema_version = 2',
    ] as const;

    scenarios.forEach((mutation, index) => {
      const filePath = tempDatabasePath(`schema-${index}.db`);
      databaseModule()
        .createVaultDatabase({
          filePath,
          databaseKey: databaseKey(index + 10),
          identity: TEST_IDENTITY,
          profileName: 'Profile',
          vaultMetaDigest: vaultMetaDigest(),
        })
        .close();
      const connection = openTestConnection(filePath, databaseKey(index + 10));
      connection.exec(mutation);
      connection.close();
      const before = fileHash(filePath);

      expectStorageCode(
        () =>
          databaseModule().openVaultDatabase({
            filePath,
            databaseKey: databaseKey(index + 10),
            expectedVaultId: TEST_VAULT_ID,
            expectedVaultMetaDigest: vaultMetaDigest(),
          }),
        index === 2 ? 'DB_SCHEMA_TOO_NEW' : 'DB_CORRUPT',
      );
      expect(fileHash(filePath)).toBe(before);
    });
  });

  it('removes a newly created database when snapshot initialization fails', () => {
    const filePath = tempDatabasePath();
    expectStorageCode(
      () =>
        databaseModule().createVaultDatabase({
          filePath,
          databaseKey: databaseKey(),
          identity: TEST_IDENTITY,
          profileName: '',
          vaultMetaDigest: vaultMetaDigest(),
        }),
      'STORAGE_OPERATION_FAILED',
    );
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}-wal`)).toBe(false);
    expect(existsSync(`${filePath}-shm`)).toBe(false);
  });

  it('keeps native and schema internals out of the package entry point', () => {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const publicApi = require('../index') as Record<string, unknown>;
    expect(publicApi.createVaultDatabase).toBeInstanceOf(Function);
    expect(publicApi.openVaultDatabase).toBeInstanceOf(Function);
    expect(publicApi.CURRENT_SCHEMA_VERSION).toBe(1);
    expect(publicApi.openNativeConnection).toBeUndefined();
    expect(publicApi.CURRENT_SCHEMA_SQL).toBeUndefined();
    expect(publicApi.runMigrations).toBeUndefined();
  });
});
