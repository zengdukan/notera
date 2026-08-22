import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface TestConnection {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
  };
  pragma(source: string, options?: { readonly simple?: boolean }): unknown;
  close(): void;
}

interface ConnectionModule {
  openNativeConnection(options: {
    filePath: string;
    databaseKey: Uint8Array;
    mode: 'CREATE' | 'OPEN_EXISTING';
  }): TestConnection;
}

interface ErrorModule {
  mapNativeError(error: unknown): { readonly code: string; message: string };
}

function connectionModule(): ConnectionModule {
  // Dynamic loading lets this test describe the desired API before the module
  // exists, while still producing an assertion failure in the RED phase.
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../connection') as ConnectionModule;
}

function errorModule(): ErrorModule {
  // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
  return require('../errors') as ErrorModule;
}

function databaseKey(seed: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

const tempRoots: string[] = [];

function tempDatabasePath(name = 'vault.db'): string {
  const root = mkdtempSync(join(tmpdir(), 'notera-storage-connection-'));
  tempRoots.push(root);
  return join(root, name);
}

afterEach(() => {
  tempRoots.splice(0).forEach((root) => {
    rmSync(root, { force: true, recursive: true });
  });
});

describe('SQLCipher connection', () => {
  it('creates an encrypted database and reopens it with the same raw key', () => {
    const filePath = tempDatabasePath();
    const key = databaseKey(10);
    const created = connectionModule().openNativeConnection({
      filePath,
      databaseKey: key,
      mode: 'CREATE',
    });

    created.exec(
      "CREATE TABLE probe(value TEXT NOT NULL); INSERT INTO probe VALUES ('ok')",
    );
    created.close();

    expect(
      readFileSync(filePath).subarray(0, 16).toString('utf8'),
    ).not.toBe('SQLite format 3\0');
    const reopened = connectionModule().openNativeConnection({
      filePath,
      databaseKey: key,
      mode: 'OPEN_EXISTING',
    });
    expect(reopened.prepare('SELECT value FROM probe').get()).toEqual({
      value: 'ok',
    });
    reopened.close();
  });

  it('rejects an incorrect key without deleting the existing database', () => {
    const filePath = tempDatabasePath();
    const created = connectionModule().openNativeConnection({
      filePath,
      databaseKey: databaseKey(20),
      mode: 'CREATE',
    });
    created.exec('CREATE TABLE probe(value TEXT NOT NULL)');
    created.close();
    const before = readFileSync(filePath);

    expect(() =>
      connectionModule().openNativeConnection({
        filePath,
        databaseKey: databaseKey(21),
        mode: 'OPEN_EXISTING',
      }),
    ).toThrow(expect.objectContaining({ code: 'DB_CORRUPT' }));
    expect(readFileSync(filePath)).toEqual(before);
  });

  it('validates modes and exact key length with safe errors', () => {
    const missingPath = tempDatabasePath('private-profile-name.db');
    expect(() =>
      connectionModule().openNativeConnection({
        filePath: missingPath,
        databaseKey: databaseKey(30),
        mode: 'OPEN_EXISTING',
      }),
    ).toThrow(expect.objectContaining({ code: 'DATABASE_NOT_FOUND' }));

    writeFileSync(missingPath, 'existing');
    expect(() =>
      connectionModule().openNativeConnection({
        filePath: missingPath,
        databaseKey: databaseKey(30),
        mode: 'CREATE',
      }),
    ).toThrow(expect.objectContaining({ code: 'DATABASE_ALREADY_EXISTS' }));

    try {
      connectionModule().openNativeConnection({
        filePath: tempDatabasePath(),
        databaseKey: new Uint8Array(31),
        mode: 'CREATE',
      });
      throw new Error('Expected invalid key error');
    } catch (error) {
      expect(error).toEqual(
        expect.objectContaining({ code: 'INVALID_DATABASE_KEY' }),
      );
      expect((error as Error).message).not.toContain('private-profile-name');
    }
  });

  it('enables fixed pragmas without enabling foreign keys', () => {
    const connection = connectionModule().openNativeConnection({
      filePath: tempDatabasePath(),
      databaseKey: databaseKey(40),
      mode: 'CREATE',
    });

    expect(connection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(connection.pragma('synchronous', { simple: true })).toBe(2);
    expect(connection.pragma('secure_delete', { simple: true })).toBe(1);
    expect(connection.pragma('temp_store', { simple: true })).toBe(2);
    expect(connection.pragma('foreign_keys', { simple: true })).toBe(0);
    connection.exec(
      "CREATE VIRTUAL TABLE probe_fts USING fts5(value, tokenize='trigram'); INSERT INTO probe_fts VALUES ('Notera encrypted note')",
    );
    expect(
      connection
        .prepare('SELECT value FROM probe_fts WHERE probe_fts MATCH ?')
        .get('Not'),
    ).toEqual({ value: 'Notera encrypted note' });
    connection.close();
  });

  it('closes idempotently, rejects later calls, and releases the file', () => {
    const filePath = tempDatabasePath();
    const connection = connectionModule().openNativeConnection({
      filePath,
      databaseKey: databaseKey(50),
      mode: 'CREATE',
    });
    connection.close();
    connection.close();

    expect(() => connection.exec('SELECT 1')).toThrow(
      expect.objectContaining({ code: 'DATABASE_CLOSED' }),
    );
    const renamed = `${filePath}.renamed`;
    renameSync(filePath, renamed);
    expect(existsSync(renamed)).toBe(true);
  });

  it('maps native error codes without forwarding sensitive messages', () => {
    const mappings = [
      ['SQLITE_NOTADB', 'DB_CORRUPT'],
      ['SQLITE_CORRUPT', 'DB_CORRUPT'],
      ['SQLITE_FULL', 'DISK_FULL'],
      ['SQLITE_BUSY', 'DATABASE_BUSY'],
      ['SQLITE_LOCKED', 'DATABASE_BUSY'],
      ['SQLITE_IOERR', 'STORAGE_OPERATION_FAILED'],
    ] as const;

    mappings.forEach(([nativeCode, expectedCode]) => {
      const mapped = errorModule().mapNativeError({
        code: nativeCode,
        message: 'SELECT secret FROM private_table',
      });
      expect(mapped.code).toBe(expectedCode);
      expect(mapped.message).not.toContain('SELECT');
      expect(mapped.message).not.toContain('private_table');
    });
  });
});
