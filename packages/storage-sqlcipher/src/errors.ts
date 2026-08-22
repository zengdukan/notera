export type StorageErrorCode =
  | 'DATABASE_CLOSED'
  | 'DATABASE_ALREADY_EXISTS'
  | 'DATABASE_NOT_FOUND'
  | 'INVALID_DATABASE_KEY'
  | 'DB_CORRUPT'
  | 'DB_SCHEMA_TOO_NEW'
  | 'MIGRATION_FAILED'
  | 'DISK_FULL'
  | 'DATABASE_BUSY'
  | 'CONTENT_VERSION_CONFLICT'
  | 'ENTITY_NOT_FOUND'
  | 'INVALID_CURSOR'
  | 'RELATION_INTEGRITY_VIOLATION'
  | 'SEARCH_INDEX_UNAVAILABLE'
  | 'STORAGE_OPERATION_FAILED';

const SAFE_MESSAGES: Readonly<Record<StorageErrorCode, string>> = {
  DATABASE_CLOSED: 'The database is closed.',
  DATABASE_ALREADY_EXISTS: 'The database already exists.',
  DATABASE_NOT_FOUND: 'The database does not exist.',
  INVALID_DATABASE_KEY: 'The database key is invalid.',
  DB_CORRUPT: 'The database cannot be read.',
  DB_SCHEMA_TOO_NEW: 'The database schema is newer than this application.',
  MIGRATION_FAILED: 'The database migration failed.',
  DISK_FULL: 'There is not enough storage space.',
  DATABASE_BUSY: 'The database is busy.',
  CONTENT_VERSION_CONFLICT: 'The content version has changed.',
  ENTITY_NOT_FOUND: 'The requested entity does not exist.',
  INVALID_CURSOR: 'The page cursor is invalid.',
  RELATION_INTEGRITY_VIOLATION: 'A related entity is invalid.',
  SEARCH_INDEX_UNAVAILABLE: 'The search index is unavailable.',
  STORAGE_OPERATION_FAILED: 'The storage operation failed.',
};

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message = SAFE_MESSAGES[code]) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

function nativeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const { code } = error;
  return typeof code === 'string' ? code : undefined;
}

export function mapNativeError(error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  const code = nativeErrorCode(error);
  if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') {
    return new StorageError('DB_CORRUPT');
  }
  if (code === 'SQLITE_FULL') {
    return new StorageError('DISK_FULL');
  }
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
    return new StorageError('DATABASE_BUSY');
  }
  return new StorageError('STORAGE_OPERATION_FAILED');
}
