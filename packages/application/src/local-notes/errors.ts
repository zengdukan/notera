import { DomainError } from '@notera/domain';
import { StorageError } from '@notera/storage-sqlcipher';

import { ApplicationError, type ApplicationErrorCode } from '../errors';

const DOMAIN_CODES: Readonly<Partial<Record<string, ApplicationErrorCode>>> = {
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  INVALID_NAME: 'INVALID_NAME',
  ROOT_FOLDER_IMMUTABLE: 'ROOT_FOLDER_IMMUTABLE',
  FOLDER_CYCLE: 'FOLDER_CYCLE',
  PARENT_FOLDER_INVALID: 'PARENT_FOLDER_INVALID',
  CONTENT_VERSION_OVERFLOW: 'CONTENT_VERSION_OVERFLOW',
  VERSION_NOTE_MISMATCH: 'VERSION_NOTE_MISMATCH',
  INVALID_ENTITY_STATE: 'INVALID_ENTITY_STATE',
  TRASH_ENTRY_EXPIRED: 'TRASH_ENTRY_EXPIRED',
  TRASH_TARGET_REQUIRED: 'TRASH_TARGET_REQUIRED',
};

const STORAGE_CODES: Readonly<Partial<Record<string, ApplicationErrorCode>>> = {
  DATABASE_CLOSED: 'PROFILE_LOCKED',
  ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
  INVALID_CURSOR: 'INVALID_CURSOR',
  DISK_FULL: 'DISK_FULL',
  CONTENT_VERSION_CONFLICT: 'CONTENT_VERSION_CONFLICT',
};

export function mapLocalNotesError(
  error: unknown,
  mode: 'READ' | 'WRITE',
): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error instanceof DomainError) {
    return new ApplicationError(DOMAIN_CODES[error.code] ?? 'OPERATION_FAILED');
  }
  if (error instanceof StorageError) {
    return new ApplicationError(
      STORAGE_CODES[error.code] ??
        (mode === 'WRITE' ? 'SAVE_FAILED' : 'OPERATION_FAILED'),
    );
  }
  return new ApplicationError(
    mode === 'WRITE' ? 'SAVE_FAILED' : 'OPERATION_FAILED',
  );
}
