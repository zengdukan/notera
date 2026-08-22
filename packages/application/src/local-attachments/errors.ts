import { AttachmentStorageError } from '@notera/attachments';
import { DomainError } from '@notera/domain';
import { StorageError } from '@notera/storage-sqlcipher';

import { ApplicationError } from '../errors';

export function mapImportError(
  error: unknown,
  phase: 'IMPORT' | 'DATABASE',
  sessionSignal: AbortSignal,
  callerSignal?: AbortSignal,
): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error instanceof AttachmentStorageError) {
    if (error.code === 'ATTACHMENT_TOO_LARGE') {
      return new ApplicationError('ATTACHMENT_TOO_LARGE');
    }
    if (error.code === 'DISK_FULL') return new ApplicationError('DISK_FULL');
    if (error.code === 'OPERATION_ABORTED') {
      return new ApplicationError(
        sessionSignal.aborted && !callerSignal?.aborted
          ? 'PROFILE_LOCKED'
          : 'OPERATION_ABORTED',
      );
    }
    return new ApplicationError('ATTACHMENT_IMPORT_FAILED');
  }
  if (error instanceof StorageError) {
    if (error.code === 'DATABASE_CLOSED') {
      return new ApplicationError('PROFILE_LOCKED');
    }
    if (error.code === 'DISK_FULL') return new ApplicationError('DISK_FULL');
    if (error.code === 'DB_CORRUPT') return new ApplicationError('DB_CORRUPT');
    return new ApplicationError(phase === 'DATABASE' ? 'SAVE_FAILED' : 'ATTACHMENT_IMPORT_FAILED');
  }
  if (error instanceof DomainError) {
    return new ApplicationError(
      error.code === 'ATTACHMENT_TOO_LARGE'
        ? 'ATTACHMENT_TOO_LARGE'
        : phase === 'DATABASE'
          ? 'SAVE_FAILED'
          : 'ATTACHMENT_IMPORT_FAILED',
    );
  }
  return new ApplicationError(
    phase === 'DATABASE' ? 'SAVE_FAILED' : 'ATTACHMENT_IMPORT_FAILED',
  );
}

export function mapReadError(
  error: unknown,
  sessionSignal?: AbortSignal,
): ApplicationError {
  if (error instanceof ApplicationError) return error;
  if (error instanceof AttachmentStorageError) {
    if (error.code === 'BLOB_MISSING') return new ApplicationError('BLOB_MISSING');
    if (
      error.code === 'BLOB_CORRUPT' ||
      error.code === 'MANIFEST_CORRUPT' ||
      error.code === 'UNSUPPORTED_MANIFEST_VERSION'
    ) {
      return new ApplicationError('BLOB_CORRUPT');
    }
    if (
      sessionSignal?.aborted ||
      error.code === 'STORE_CLOSED' ||
      error.code === 'READER_CLOSED'
    ) {
      return new ApplicationError('PROFILE_LOCKED');
    }
  }
  if (error instanceof StorageError) {
    if (error.code === 'DATABASE_CLOSED') return new ApplicationError('PROFILE_LOCKED');
    if (error.code === 'INVALID_CURSOR') return new ApplicationError('INVALID_CURSOR');
    if (error.code === 'DB_CORRUPT') return new ApplicationError('DB_CORRUPT');
  }
  return new ApplicationError('OPERATION_FAILED');
}
