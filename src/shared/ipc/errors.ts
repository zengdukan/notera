import { z } from 'zod';

export const IPC_ERROR_CODES = [
  'INVALID_IPC_REQUEST',
  'INVALID_IPC_RESPONSE',
  'IPC_OPERATION_FAILED',
  'INVALID_CURSOR',
  'PROFILE_LOCKED',
  'OPERATION_NOT_FOUND',
  'WRONG_PASSWORD',
  'VAULT_META_INVALID',
  'CRYPTO_UNAVAILABLE',
  'DB_CORRUPT',
  'DB_SCHEMA_TOO_NEW',
  'MIGRATION_FAILED',
  'ENTITY_NOT_FOUND',
  'INVALID_ENTITY_STATE',
  'INVALID_NAME',
  'FOLDER_CYCLE',
  'ROOT_FOLDER_IMMUTABLE',
  'PARENT_FOLDER_INVALID',
  'DUPLICATE_TARGET_ID',
  'CONTENT_VERSION_CONFLICT',
  'CONTENT_VERSION_OVERFLOW',
  'VERSION_NOTE_MISMATCH',
  'TRASH_ENTRY_EXPIRED',
  'TRASH_TARGET_REQUIRED',
  'ATTACHMENT_TOO_LARGE',
  'ATTACHMENT_STILL_REFERENCED',
  'BLOB_MISSING',
  'BLOB_CORRUPT',
  'SAVE_FAILED',
  'DISK_FULL',
  'ATTACHMENT_IMPORT_FAILED',
  'ATTACHMENT_SAVE_FAILED',
  'EXPORT_FAILED',
] as const;

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number];

export interface IpcError {
  readonly code: IpcErrorCode;
  readonly message: string;
}

export const IPC_ERROR_MESSAGES: Readonly<Record<IpcErrorCode, string>> = {
  INVALID_IPC_REQUEST: 'The request is invalid.',
  INVALID_IPC_RESPONSE: 'The response is invalid.',
  IPC_OPERATION_FAILED: 'The operation failed.',
  INVALID_CURSOR: 'The page cursor is invalid.',
  PROFILE_LOCKED: 'The profile is locked.',
  OPERATION_NOT_FOUND: 'The operation was not found.',
  WRONG_PASSWORD: 'The password is incorrect.',
  VAULT_META_INVALID: 'The profile metadata is invalid.',
  CRYPTO_UNAVAILABLE: 'Cryptography is unavailable.',
  DB_CORRUPT: 'The profile database is corrupt.',
  DB_SCHEMA_TOO_NEW: 'The profile requires a newer application version.',
  MIGRATION_FAILED: 'The database upgrade failed.',
  ENTITY_NOT_FOUND: 'The requested item was not found.',
  INVALID_ENTITY_STATE: 'The item is in an invalid state.',
  INVALID_NAME: 'The name is invalid.',
  FOLDER_CYCLE: 'The folder move would create a cycle.',
  ROOT_FOLDER_IMMUTABLE: 'The root folder cannot be changed.',
  PARENT_FOLDER_INVALID: 'The parent folder is invalid.',
  DUPLICATE_TARGET_ID: 'A target identifier is duplicated.',
  CONTENT_VERSION_CONFLICT: 'The note was changed by another save.',
  CONTENT_VERSION_OVERFLOW: 'The content version cannot be incremented.',
  VERSION_NOTE_MISMATCH: 'The version does not belong to the note.',
  TRASH_ENTRY_EXPIRED: 'The trash entry has expired.',
  TRASH_TARGET_REQUIRED: 'A restore destination is required.',
  ATTACHMENT_TOO_LARGE: 'The attachment exceeds the size limit.',
  ATTACHMENT_STILL_REFERENCED: 'The attachment is still referenced.',
  BLOB_MISSING: 'The attachment data is missing.',
  BLOB_CORRUPT: 'The attachment data is corrupt.',
  SAVE_FAILED: 'The note could not be saved.',
  DISK_FULL: 'There is not enough disk space.',
  ATTACHMENT_IMPORT_FAILED: 'The attachment could not be imported.',
  ATTACHMENT_SAVE_FAILED: 'The attachment could not be saved.',
  EXPORT_FAILED: 'The note could not be exported.',
};

export const ipcErrorCodeSchema = z.enum(IPC_ERROR_CODES);

export const ipcErrorSchema = z
  .strictObject({
    code: ipcErrorCodeSchema,
    message: z.string(),
  })
  .superRefine((error, context) => {
    if (error.message !== IPC_ERROR_MESSAGES[error.code]) {
      context.addIssue({
        code: 'custom',
        message: 'IPC errors must use the fixed safe message.',
      });
    }
  });
