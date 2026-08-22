export interface NativeRunResult {
  readonly changes: number;
  readonly lastInsertRowid: number | bigint;
}

export interface NativeStatement<Row = Record<string, unknown>> {
  run(...parameters: unknown[]): NativeRunResult;
  get(...parameters: unknown[]): Row | undefined;
  all(...parameters: unknown[]): Row[];
  iterate(...parameters: unknown[]): IterableIterator<Row>;
}

export interface NativeTransaction<
  Arguments extends unknown[],
  Result,
> {
  (...arguments_: Arguments): Result;
  deferred(...arguments_: Arguments): Result;
  immediate(...arguments_: Arguments): Result;
  exclusive(...arguments_: Arguments): Result;
}

export interface NativeDatabase {
  exec(sql: string): this;
  prepare<Row = Record<string, unknown>>(sql: string): NativeStatement<Row>;
  pragma(
    source: string,
    options?: Readonly<{ simple?: boolean }>,
  ): unknown;
  transaction<Arguments extends unknown[], Result>(
    operation: (...arguments_: Arguments) => Result,
  ): NativeTransaction<Arguments, Result>;
  close(): void;
}

export interface NativeDatabaseOptions {
  readonly fileMustExist?: boolean;
  readonly timeout?: number;
}

export interface NativeSqlcipherConstructor {
  new (filePath: string, options?: NativeDatabaseOptions): NativeDatabase;
}
