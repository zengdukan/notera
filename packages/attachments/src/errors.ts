export type AttachmentStorageErrorCode =
  | 'INVALID_ATTACHMENT_INPUT'
  | 'ATTACHMENT_TOO_LARGE'
  | 'OPERATION_ABORTED'
  | 'UNSUPPORTED_MANIFEST_VERSION'
  | 'MANIFEST_CORRUPT'
  | 'BLOB_ALREADY_EXISTS'
  | 'BLOB_MISSING'
  | 'BLOB_CORRUPT'
  | 'BLOB_IN_USE'
  | 'DISK_FULL'
  | 'STORE_ALREADY_OPEN'
  | 'STORE_CLOSED'
  | 'READER_CLOSED'
  | 'ATTACHMENT_IO_FAILED';

const SAFE_MESSAGES: Readonly<Record<AttachmentStorageErrorCode, string>> = {
  INVALID_ATTACHMENT_INPUT: 'The attachment input is invalid.',
  ATTACHMENT_TOO_LARGE: 'The attachment exceeds the size limit.',
  OPERATION_ABORTED: 'The attachment operation was cancelled.',
  UNSUPPORTED_MANIFEST_VERSION: 'The attachment manifest is unsupported.',
  MANIFEST_CORRUPT: 'The attachment manifest is corrupt.',
  BLOB_ALREADY_EXISTS: 'The attachment blob already exists.',
  BLOB_MISSING: 'The attachment blob is missing.',
  BLOB_CORRUPT: 'The attachment blob is corrupt.',
  BLOB_IN_USE: 'The attachment blob is in use.',
  DISK_FULL: 'There is not enough storage space.',
  STORE_ALREADY_OPEN: 'The attachment store is already open.',
  STORE_CLOSED: 'The attachment store is closed.',
  READER_CLOSED: 'The attachment reader is closed.',
  ATTACHMENT_IO_FAILED: 'The attachment storage operation failed.',
};

export class AttachmentStorageError extends Error {
  readonly code: AttachmentStorageErrorCode;

  constructor(code: AttachmentStorageErrorCode) {
    super(SAFE_MESSAGES[code]);
    this.name = 'AttachmentStorageError';
    this.code = code;
  }
}

function errorField(error: unknown, field: 'code' | 'name'): string | undefined {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return undefined;
  }
  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

export function mapAttachmentError(error: unknown): AttachmentStorageError {
  if (error instanceof AttachmentStorageError) {
    return error;
  }
  if (
    errorField(error, 'name') === 'AbortError' ||
    errorField(error, 'code') === 'ABORT_ERR'
  ) {
    return new AttachmentStorageError('OPERATION_ABORTED');
  }
  if (errorField(error, 'code') === 'ENOSPC') {
    return new AttachmentStorageError('DISK_FULL');
  }
  return new AttachmentStorageError('ATTACHMENT_IO_FAILED');
}
