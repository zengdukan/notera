import { existsSync } from 'node:fs';

import type { SqlcipherConnection } from '../connection';
import type { StorageError } from '../errors';
import {
  cleanupTempDatabases,
  databaseKey,
  normalizeSchema,
  openTestConnection,
  tempDatabasePath,
  TEST_IDENTITY,
  vaultMetaDigest,
} from './helpers';

interface Migration {
  readonly targetVersion: number;
  readonly migrate: (database: SqlcipherConnection) => void;
  readonly validate: (database: SqlcipherConnection) => void;
}

interface RegistryModule {
  readonly CURRENT_SCHEMA_VERSION: number;
  validateMigrationRegistry(
    migrations: readonly Migration[],
    fromVersion: number,
    targetVersion: number,
  ): readonly Migration[];
  selectMigrationRange(
    migrations: readonly Migration[],
    baseVersion: number,
    fromVersion: number,
  ): readonly Migration[];
  selectProductionMigrations(fromVersion: number): readonly Migration[];
}

interface RunnerModule {
  runMigrations(
    database: SqlcipherConnection,
    fromVersion: number,
    targetVersion: number,
    migrations: readonly Migration[],
  ): void;
}

interface BaselineV1Module {
  createBaselineV1(
    database: SqlcipherConnection,
    input: {
      identity: typeof TEST_IDENTITY;
      profileName: string;
      vaultMetaDigest: Uint8Array;
      createdAt: number;
    },
  ): void;
}

interface SchemaV2Module {
  readonly V2_PENDING_VAULT_META_DIGEST: Migration;
}

interface SchemaV3Module {
  readonly V3_NOTE_VERSION_NAME: Migration;
}

interface SchemaV4Module {
  readonly V4_NORMALIZED_ATTACHMENT_BLOBS: Migration;
}

interface SnapshotDatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: typeof TEST_IDENTITY;
    profileName: string;
    vaultMetaDigest: Uint8Array;
  }): { close(): void };
  openVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    expectedVaultId: typeof TEST_IDENTITY.id;
    expectedVaultMetaDigest: Uint8Array;
  }): { close(): void };
}

function registryModule(): RegistryModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../migrations/registry') as RegistryModule;
}

function runnerModule(): RunnerModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../migrations/runner') as RunnerModule;
}

function baselineV1Module(): BaselineV1Module {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../schema/baseline-v1') as BaselineV1Module;
}

function schemaV2Module(): SchemaV2Module {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../schema/v2') as SchemaV2Module;
}

function schemaV3Module(): SchemaV3Module {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../schema/v3') as SchemaV3Module;
}

function schemaV4Module(): SchemaV4Module {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../schema/v4') as SchemaV4Module;
}

function databaseModuleWithProductionMigrations(
  migrations: readonly Migration[],
): SnapshotDatabaseModule {
  const currentVersion = migrations.at(-1)?.targetVersion ?? 1;
  jest.resetModules();
  jest.doMock('../migrations/registry', () => {
    const actual = jest.requireActual(
      '../migrations/registry',
    ) as RegistryModule;
    return {
      ...actual,
      PRODUCTION_MIGRATIONS: Object.freeze([...migrations]),
      CURRENT_SCHEMA_VERSION: currentVersion,
      selectProductionMigrations(fromVersion: number) {
        return actual.selectMigrationRange(migrations, 1, fromVersion);
      },
    };
  });
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../database') as SnapshotDatabaseModule;
}

function createBaselineDatabase(filePath: string): void {
  const connection = openNewConnection(filePath);
  connection.transaction(() => {
    baselineV1Module().createBaselineV1(connection, {
      identity: TEST_IDENTITY,
      profileName: 'Profile',
      vaultMetaDigest: vaultMetaDigest(),
      createdAt: 1,
    });
  })();
  connection.close();
}

function createMigrationDatabase(version: number): {
  filePath: string;
  connection: SqlcipherConnection;
} {
  const filePath = tempDatabasePath();
  const connection = openNewConnection(filePath);
  connection.exec(`
    CREATE TABLE schema_metadata(
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      schema_version INTEGER NOT NULL
    );
    INSERT INTO schema_metadata VALUES (1, ${version});
    CREATE TABLE migration_audit(value TEXT NOT NULL);
  `);
  return { filePath, connection };
}

function openNewConnection(filePath: string): SqlcipherConnection {
  // Loading through the existing internal connection keeps migration tests on
  // the real SQLCipher transaction implementation.
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  const { openNativeConnection } =
    require('../connection') as typeof import('../connection');
  return openNativeConnection({
    filePath,
    databaseKey: databaseKey(),
    mode: 'CREATE',
  });
}

function migration(
  targetVersion: number,
  migrate: Migration['migrate'] = () => {},
  validate: Migration['validate'] = () => {},
): Migration {
  return { targetVersion, migrate, validate };
}

function expectMigrationFailure(operation: () => unknown): void {
  try {
    operation();
    throw new Error('Expected migration failure');
  } catch (error) {
    expect((error as StorageError).code).toBe('MIGRATION_FAILED');
  }
}

afterEach(() => {
  jest.dontMock('../migrations/registry');
  jest.resetModules();
  cleanupTempDatabases();
});

describe('schema migrations', () => {
  it('derives the current version and selects only the continuous suffix', () => {
    const registry = registryModule();
    expect(registry.CURRENT_SCHEMA_VERSION).toBe(4);
    expect(registry.selectProductionMigrations(1)).toEqual([
      schemaV2Module().V2_PENDING_VAULT_META_DIGEST,
      schemaV3Module().V3_NOTE_VERSION_NAME,
      schemaV4Module().V4_NORMALIZED_ATTACHMENT_BLOBS,
    ]);
    expect(registry.selectProductionMigrations(2)).toEqual([
      schemaV3Module().V3_NOTE_VERSION_NAME,
      schemaV4Module().V4_NORMALIZED_ATTACHMENT_BLOBS,
    ]);
    expect(registry.selectProductionMigrations(3)).toEqual([
      schemaV4Module().V4_NORMALIZED_ATTACHMENT_BLOBS,
    ]);
    expect(registry.selectProductionMigrations(4)).toEqual([]);

    const v2 = migration(2);
    const v3 = migration(3);
    const v4 = migration(4);
    const history = [v2, v3, v4];
    expect(registry.selectMigrationRange(history, 1, 1)).toEqual([v2, v3, v4]);
    expect(registry.selectMigrationRange(history, 1, 2)).toEqual([v3, v4]);
    expect(registry.selectMigrationRange(history, 1, 3)).toEqual([v4]);
    expect(registry.selectMigrationRange(history, 1, 4)).toEqual([]);
  });

  it('rejects invalid history before selecting a migration suffix', () => {
    const registry = registryModule();
    const invalidHistories = [
      [migration(2), migration(2)],
      [migration(2), migration(4)],
      [migration(3), migration(2)],
      [migration(1), migration(2)],
    ];
    invalidHistories.forEach((history) => {
      expectMigrationFailure(() =>
        registry.selectMigrationRange(history, 1, 2),
      );
    });

    [0, 4, Number.NaN, Number.MAX_SAFE_INTEGER + 1].forEach((fromVersion) => {
      expectMigrationFailure(() =>
        registry.selectMigrationRange(
          [migration(2), migration(3)],
          1,
          fromVersion,
        ),
      );
    });
  });

  it('validates an ordered, gap-free registry for the requested range', () => {
    const valid = [migration(2), migration(3), migration(4)];
    expect(registryModule().validateMigrationRegistry(valid, 1, 4)).toEqual(
      valid,
    );

    [
      [migration(2), migration(2)],
      [migration(2), migration(4)],
      [migration(3), migration(2)],
      [migration(1), migration(2)],
    ].forEach((invalid) => {
      expectMigrationFailure(() =>
        registryModule().validateMigrationRegistry(invalid, 1, 3),
      );
    });
  });

  it('commits each version, rolls back the failing version, and resumes', () => {
    const { connection } = createMigrationDatabase(1);
    const firstAttempt = [
      migration(
        2,
        (database) => {
          database.prepare('INSERT INTO migration_audit VALUES (?)').run('v2');
        },
        (database) => {
          expect(
            database
              .prepare('SELECT value FROM migration_audit WHERE value = ?')
              .get('v2'),
          ).toEqual({ value: 'v2' });
        },
      ),
      migration(3, (database) => {
        database.prepare('INSERT INTO migration_audit VALUES (?)').run('v3');
        throw new Error('injected current-version failure');
      }),
    ];

    expectMigrationFailure(() =>
      runnerModule().runMigrations(connection, 1, 3, firstAttempt),
    );
    expect(
      connection.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 2 });
    expect(
      connection
        .prepare('SELECT value FROM migration_audit ORDER BY value')
        .all(),
    ).toEqual([{ value: 'v2' }]);

    runnerModule().runMigrations(connection, 2, 3, [
      migration(3, (database) => {
        database.prepare('INSERT INTO migration_audit VALUES (?)').run('v3');
      }),
    ]);
    expect(
      connection.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 3 });
    expect(
      connection
        .prepare('SELECT value FROM migration_audit ORDER BY value')
        .all(),
    ).toEqual([{ value: 'v2' }, { value: 'v3' }]);
    connection.close();
  });

  it('rolls back writes when validation of the current version fails', () => {
    const { connection } = createMigrationDatabase(1);
    expectMigrationFailure(() =>
      runnerModule().runMigrations(connection, 1, 2, [
        migration(
          2,
          (database) => {
            database
              .prepare('INSERT INTO migration_audit VALUES (?)')
              .run('v2');
          },
          () => {
            throw new Error('injected validation failure');
          },
        ),
      ]),
    );
    expect(
      connection.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 1 });
    expect(
      connection.prepare('SELECT value FROM migration_audit').all(),
    ).toEqual([]);
    connection.close();
  });

  it('creates the v1 baseline before replaying production migrations', () => {
    const v2 = migration(
      2,
      (database) => {
        schemaV2Module().V2_PENDING_VAULT_META_DIGEST.migrate(database);
        database.exec(`
          CREATE TABLE lifecycle_audit(value TEXT NOT NULL);
          INSERT INTO lifecycle_audit VALUES ('v2');
        `);
      },
      (database) => {
        schemaV2Module().V2_PENDING_VAULT_META_DIGEST.validate(database);
        const row = database.prepare('SELECT value FROM lifecycle_audit').get();
        if ((row as { value?: unknown } | undefined)?.value !== 'v2') {
          throw new Error('v2 validation failed');
        }
      },
    );
    const filePath = tempDatabasePath('create-replay.db');
    databaseModuleWithProductionMigrations([v2])
      .createVaultDatabase({
        filePath,
        databaseKey: databaseKey(),
        identity: TEST_IDENTITY,
        profileName: 'Profile',
        vaultMetaDigest: vaultMetaDigest(),
      })
      .close();

    const connection = openTestConnection(filePath);
    try {
      expect(
        connection.prepare('SELECT schema_version FROM schema_metadata').get(),
      ).toEqual({ schema_version: 2 });
      expect(
        connection.prepare('SELECT value FROM lifecycle_audit').all(),
      ).toEqual([{ value: 'v2' }]);
    } finally {
      connection.close();
    }
  });

  it('opens from an intermediate version with only the remaining suffix', () => {
    const filePath = tempDatabasePath('open-suffix.db');
    createBaselineDatabase(filePath);
    const v2 = migration(2, (database) => {
      schemaV2Module().V2_PENDING_VAULT_META_DIGEST.migrate(database);
      database.exec(`
        CREATE TABLE lifecycle_audit(value TEXT NOT NULL);
        INSERT INTO lifecycle_audit VALUES ('v2');
      `);
    });
    const connection = openTestConnection(filePath);
    runnerModule().runMigrations(connection, 1, 2, [v2]);
    connection.close();

    const v3 = migration(3, (database) => {
      database.prepare('INSERT INTO lifecycle_audit VALUES (?)').run('v3');
    });
    databaseModuleWithProductionMigrations([v2, v3])
      .openVaultDatabase({
        filePath,
        databaseKey: databaseKey(),
        expectedVaultId: TEST_IDENTITY.id,
        expectedVaultMetaDigest: vaultMetaDigest(),
      })
      .close();

    const migrated = openTestConnection(filePath);
    expect(
      migrated.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 3 });
    expect(
      migrated
        .prepare('SELECT value FROM lifecycle_audit ORDER BY value')
        .all(),
    ).toEqual([{ value: 'v2' }, { value: 'v3' }]);
    migrated.close();
  });

  it('removes a new database when a production migration fails', () => {
    const filePath = tempDatabasePath('create-failure.db');
    const failingV2 = migration(2, () => {
      throw new Error('injected create migration failure');
    });
    let created: { close(): void } | undefined;
    try {
      expectMigrationFailure(() => {
        created = databaseModuleWithProductionMigrations([
          failingV2,
        ]).createVaultDatabase({
          filePath,
          databaseKey: databaseKey(),
          identity: TEST_IDENTITY,
          profileName: 'Profile',
          vaultMetaDigest: vaultMetaDigest(),
        });
        created.close();
      });
    } finally {
      created?.close();
    }
    expect(existsSync(filePath)).toBe(false);
    expect(existsSync(`${filePath}-wal`)).toBe(false);
    expect(existsSync(`${filePath}-shm`)).toBe(false);
  });

  it('keeps an existing database when a production migration fails', () => {
    const filePath = tempDatabasePath('open-failure.db');
    createBaselineDatabase(filePath);
    const failingV2 = migration(2, (database) => {
      database.exec('CREATE TABLE rolled_back(value TEXT NOT NULL)');
      throw new Error('injected open migration failure');
    });

    expectMigrationFailure(() =>
      databaseModuleWithProductionMigrations([failingV2]).openVaultDatabase({
        filePath,
        databaseKey: databaseKey(),
        expectedVaultId: TEST_IDENTITY.id,
        expectedVaultMetaDigest: vaultMetaDigest(),
      }),
    );
    expect(existsSync(filePath)).toBe(true);
    const connection = openTestConnection(filePath);
    expect(
      connection.prepare('SELECT schema_version FROM schema_metadata').get(),
    ).toEqual({ schema_version: 1 });
    expect(
      connection
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name = 'rolled_back'`,
        )
        .get(),
    ).toBeUndefined();
    connection.close();
  });

  it('produces the same normalized structure from snapshot and migration', () => {
    const freshPath = tempDatabasePath('fresh.db');
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const { createVaultDatabase } =
      require('../database') as SnapshotDatabaseModule;
    createVaultDatabase({
      filePath: freshPath,
      databaseKey: databaseKey(),
      identity: TEST_IDENTITY,
      profileName: 'Profile',
      vaultMetaDigest: vaultMetaDigest(),
    }).close();

    const migratedPath = tempDatabasePath('migrated.db');
    const migrated = openNewConnection(migratedPath);
    migrated.exec(`
      CREATE TABLE schema_metadata(
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        schema_version INTEGER NOT NULL
      );
      INSERT INTO schema_metadata VALUES (1, 0);
    `);
    runnerModule().runMigrations(migrated, 0, 4, [
      migration(1, (database) => {
        database.exec('DROP TABLE schema_metadata');
        baselineV1Module().createBaselineV1(database, {
          identity: TEST_IDENTITY,
          profileName: 'Profile',
          vaultMetaDigest: vaultMetaDigest(),
          createdAt: 1,
        });
      }),
      schemaV2Module().V2_PENDING_VAULT_META_DIGEST,
      schemaV3Module().V3_NOTE_VERSION_NAME,
      schemaV4Module().V4_NORMALIZED_ATTACHMENT_BLOBS,
    ]);

    const fresh = openTestConnection(freshPath);
    expect(normalizeSchema(migrated)).toEqual(normalizeSchema(fresh));
    fresh.close();
    migrated.close();
  });
});
