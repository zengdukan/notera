import { existsSync, rmSync } from 'node:fs';

import { withDatabaseKeyHex } from './database-key';
import { mapNativeError, StorageError } from './errors';
import { loadNativeSqlcipher } from './native/load';
import type {
  NativeDatabase,
  NativeRunResult,
  NativeStatement,
} from './native/types';

const BUSY_TIMEOUT_MILLISECONDS = 5_000;

export interface OpenNativeConnectionOptions {
  readonly filePath: string;
  readonly databaseKey: Uint8Array;
  readonly mode: 'CREATE' | 'OPEN_EXISTING';
}

export interface SqlcipherStatement<Row = Record<string, unknown>> {
  run(...parameters: unknown[]): NativeRunResult;
  get(...parameters: unknown[]): Row | undefined;
  all(...parameters: unknown[]): Row[];
  iterate(...parameters: unknown[]): IterableIterator<Row>;
}

export interface SqlcipherConnection {
  exec(sql: string): void;
  prepare<Row = Record<string, unknown>>(sql: string): SqlcipherStatement<Row>;
  pragma(
    source: string,
    options?: Readonly<{ simple?: boolean }>,
  ): unknown;
  transaction<Arguments extends unknown[], Result>(
    operation: (...arguments_: Arguments) => Result,
  ): (...arguments_: Arguments) => Result;
  close(): void;
}

class ConnectionStatement<Row> implements SqlcipherStatement<Row> {
  constructor(
    private readonly connection: ManagedSqlcipherConnection,
    private readonly statement: NativeStatement<Row>,
  ) {}

  run(...parameters: unknown[]): NativeRunResult {
    return this.connection.runNative(() => this.statement.run(...parameters));
  }

  get(...parameters: unknown[]): Row | undefined {
    return this.connection.runNative(() => this.statement.get(...parameters));
  }

  all(...parameters: unknown[]): Row[] {
    return this.connection.runNative(() => this.statement.all(...parameters));
  }

  *iterate(...parameters: unknown[]): IterableIterator<Row> {
    const iterator = this.connection.runNative(() =>
      this.statement.iterate(...parameters),
    );
    try {
      for (const row of iterator) {
        this.connection.assertOpen();
        yield row;
      }
    } catch (error) {
      throw mapNativeError(error);
    }
  }
}

class ManagedSqlcipherConnection implements SqlcipherConnection {
  private database: NativeDatabase | undefined;

  constructor(database: NativeDatabase) {
    this.database = database;
  }

  assertOpen(): NativeDatabase {
    if (this.database === undefined) {
      throw new StorageError('DATABASE_CLOSED');
    }
    return this.database;
  }

  runNative<Result>(operation: (database: NativeDatabase) => Result): Result {
    const database = this.assertOpen();
    try {
      return operation(database);
    } catch (error) {
      throw mapNativeError(error);
    }
  }

  exec(sql: string): void {
    this.runNative((database) => {
      database.exec(sql);
    });
  }

  prepare<Row = Record<string, unknown>>(
    sql: string,
  ): SqlcipherStatement<Row> {
    const statement = this.runNative((database) => database.prepare<Row>(sql));
    return new ConnectionStatement(this, statement);
  }

  pragma(
    source: string,
    options?: Readonly<{ simple?: boolean }>,
  ): unknown {
    return this.runNative((database) => database.pragma(source, options));
  }

  transaction<Arguments extends unknown[], Result>(
    operation: (...arguments_: Arguments) => Result,
  ): (...arguments_: Arguments) => Result {
    let callbackThrew = false;
    let callbackError: unknown;
    const transaction = this.runNative((database) =>
      database.transaction((...arguments_: Arguments): Result => {
        try {
          return operation(...arguments_);
        } catch (error) {
          callbackThrew = true;
          callbackError = error;
          throw error;
        }
      }),
    );
    return (...arguments_: Arguments): Result => {
      this.assertOpen();
      callbackThrew = false;
      callbackError = undefined;
      try {
        return transaction(...arguments_);
      } catch (error) {
        if (callbackThrew) {
          throw callbackError;
        }
        throw mapNativeError(error);
      }
    };
  }

  close(): void {
    const database = this.database;
    if (database === undefined) {
      return;
    }

    this.database = undefined;
    let checkpointError: StorageError | undefined;
    try {
      database.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      checkpointError = mapNativeError(error);
    } finally {
      try {
        database.close();
      } catch (error) {
        if (checkpointError === undefined) {
          checkpointError = mapNativeError(error);
        }
      }
    }

    if (checkpointError !== undefined) {
      throw checkpointError;
    }
  }
}

function removeCreatedDatabaseFiles(filePath: string): void {
  [filePath, `${filePath}-wal`, `${filePath}-shm`].forEach((candidate) => {
    try {
      rmSync(candidate, { force: true });
    } catch {
      // Cleanup must not replace the safe storage error that caused it.
    }
  });
}

export function openNativeConnection(
  options: OpenNativeConnectionOptions,
): SqlcipherConnection {
  const { filePath, databaseKey, mode } = options;
  const existedBeforeOpen = existsSync(filePath);

  if (mode === 'CREATE' && existedBeforeOpen) {
    throw new StorageError('DATABASE_ALREADY_EXISTS');
  }
  if (mode === 'OPEN_EXISTING' && !existedBeforeOpen) {
    throw new StorageError('DATABASE_NOT_FOUND');
  }

  let database: NativeDatabase | undefined;
  try {
    const NativeSqlcipher = loadNativeSqlcipher();
    database = new NativeSqlcipher(filePath, {
      fileMustExist: mode === 'OPEN_EXISTING',
      timeout: BUSY_TIMEOUT_MILLISECONDS,
    });

    withDatabaseKeyHex(databaseKey, (hex) => {
      database?.pragma(`key = "x'${hex}'"`);
    });
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = FULL');
    database.pragma('secure_delete = ON');
    database.pragma('temp_store = MEMORY');
    database.pragma('foreign_keys = OFF');
    database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MILLISECONDS}`);

    return new ManagedSqlcipherConnection(database);
  } catch (error) {
    if (database !== undefined) {
      try {
        database.close();
      } catch {
        // Preserve the original mapped failure.
      }
    }
    if (mode === 'CREATE' && !existedBeforeOpen) {
      removeCreatedDatabaseFiles(filePath);
    }
    throw mapNativeError(error);
  }
}
