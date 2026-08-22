export type ApplicationErrorCode =
  | 'PROFILE_LOCKED'
  | 'ENTITY_NOT_FOUND'
  | 'INVALID_NAME'
  | 'ROOT_FOLDER_IMMUTABLE'
  | 'FOLDER_CYCLE'
  | 'PARENT_FOLDER_INVALID'
  | 'INVALID_CURSOR'
  | 'CONTENT_VERSION_CONFLICT'
  | 'CONTENT_VERSION_OVERFLOW'
  | 'WRONG_PASSWORD'
  | 'VAULT_META_INVALID'
  | 'CRYPTO_UNAVAILABLE'
  | 'DB_CORRUPT'
  | 'DB_SCHEMA_TOO_NEW'
  | 'MIGRATION_FAILED'
  | 'DISK_FULL'
  | 'SAVE_FAILED'
  | 'REMOVE_FAILED'
  | 'APPLICATION_CLOSED'
  | 'OPERATION_FAILED';

const SAFE_MESSAGES: Readonly<Record<ApplicationErrorCode, string>> = {
  PROFILE_LOCKED: 'The profile is locked.',
  ENTITY_NOT_FOUND: 'The requested entity does not exist.',
  INVALID_NAME: 'The name is invalid.',
  ROOT_FOLDER_IMMUTABLE: 'The root folder cannot be changed.',
  FOLDER_CYCLE: 'The folder move would create a cycle.',
  PARENT_FOLDER_INVALID: 'The parent folder is invalid.',
  INVALID_CURSOR: 'The page cursor is invalid.',
  CONTENT_VERSION_CONFLICT: 'The note content has changed.',
  CONTENT_VERSION_OVERFLOW: 'The note content version cannot be incremented.',
  WRONG_PASSWORD: 'The password is incorrect.',
  VAULT_META_INVALID: 'The profile metadata is invalid.',
  CRYPTO_UNAVAILABLE: 'Encryption is unavailable.',
  DB_CORRUPT: 'The profile database cannot be read.',
  DB_SCHEMA_TOO_NEW: 'The profile database is newer than this application.',
  MIGRATION_FAILED: 'The profile database migration failed.',
  DISK_FULL: 'There is not enough storage space.',
  SAVE_FAILED: 'The data could not be saved.',
  REMOVE_FAILED: 'The profile could not be removed.',
  APPLICATION_CLOSED: 'The application service is closed.',
  OPERATION_FAILED: 'The operation failed.',
};

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;

  constructor(code: ApplicationErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

function nativeCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

export function mapFileError(
  error: unknown,
  fallback: Extract<ApplicationErrorCode, 'SAVE_FAILED' | 'REMOVE_FAILED'>,
): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }
  return new ApplicationError(
    nativeCode(error) === 'ENOSPC' ? 'DISK_FULL' : fallback,
  );
}
