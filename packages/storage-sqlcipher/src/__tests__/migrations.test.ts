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

interface SnapshotDatabaseModule {
  createVaultDatabase(options: {
    filePath: string;
    databaseKey: Uint8Array;
    identity: typeof TEST_IDENTITY;
    profileName: string;
    vaultMetaDigest: Uint8Array;
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

afterEach(cleanupTempDatabases);

describe('schema migrations', () => {
  it('derives the current version and selects only the continuous suffix', () => {
    const registry = registryModule();
    expect(registry.CURRENT_SCHEMA_VERSION).toBe(1);
    expect(registry.selectProductionMigrations(1)).toEqual([]);

    const v2 = migration(2);
    const v3 = migration(3);
    const history = [v2, v3];
    expect(registry.selectMigrationRange(history, 1, 1)).toEqual([v2, v3]);
    expect(registry.selectMigrationRange(history, 1, 2)).toEqual([v3]);
    expect(registry.selectMigrationRange(history, 1, 3)).toEqual([]);
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
        registry.selectMigrationRange([migration(2), migration(3)], 1, fromVersion),
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
    runnerModule().runMigrations(migrated, 0, 1, [
      migration(1, (database) => {
        database.exec('DROP TABLE schema_metadata');
        baselineV1Module().createBaselineV1(database, {
          identity: TEST_IDENTITY,
          profileName: 'Profile',
          vaultMetaDigest: vaultMetaDigest(),
          createdAt: 1,
        });
      }),
    ]);

    const fresh = openTestConnection(freshPath);
    expect(normalizeSchema(migrated)).toEqual(normalizeSchema(fresh));
    fresh.close();
    migrated.close();
  });
});
