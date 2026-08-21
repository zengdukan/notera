import { z } from 'zod';
import {
  emptyObjectSchema,
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { startOperationResultSchema } from './operation';

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const nonBlankString = (limit: number) =>
  limitedUnicodeString(limit).refine((value) => value.trim().length > 0, {
    message: 'The value cannot be blank.',
  });

export const attachmentSummarySchema = z.strictObject({
  id: uuidSchema,
  fileName: nonBlankString(255),
  mime: nonBlankString(255),
  byteLength: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  localState: z.enum(['AVAILABLE', 'MISSING', 'CORRUPT']),
  previewable: z.boolean(),
  createdAt: timestampSchema,
});

const attachmentErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'BLOB_MISSING',
  'BLOB_CORRUPT',
  'IPC_OPERATION_FAILED',
] as const;

export const attachmentListForNote = defineRequestContract({
  key: 'attachment.listForNote',
  channel: 'notera:attachment:list-for-note',
  request: cursorPageRequestSchema.extend({ noteId: uuidSchema }),
  data: cursorPageSchema(attachmentSummarySchema),
  errors: [...attachmentErrors, 'INVALID_CURSOR'],
});

export const attachmentStartImport = defineRequestContract({
  key: 'attachment.startImport',
  channel: 'notera:attachment:start-import',
  request: z.strictObject({ noteId: uuidSchema }),
  data: startOperationResultSchema,
  errors: [
    ...attachmentErrors,
    'ATTACHMENT_TOO_LARGE',
    'ATTACHMENT_IMPORT_FAILED',
    'DISK_FULL',
  ],
});

export const attachmentRemoveFromNote = defineRequestContract({
  key: 'attachment.removeFromNote',
  channel: 'notera:attachment:remove-from-note',
  request: z.strictObject({ noteId: uuidSchema, attachmentId: uuidSchema }),
  data: emptyObjectSchema,
  errors: [
    ...attachmentErrors,
    'ATTACHMENT_STILL_REFERENCED',
    'SAVE_FAILED',
    'DISK_FULL',
  ],
});

const previewResultSchema = z
  .strictObject({
    url: z
      .string()
      .max(4096)
      .refine((value) => {
        try {
          return new URL(value).protocol === 'notera-media:';
        } catch {
          return false;
        }
      }, 'Preview URL must use the notera-media protocol.'),
    expiresAt: timestampSchema,
  })
  .refine((value) => value.expiresAt > Date.now(), {
    path: ['expiresAt'],
    message: 'Preview URL must not be expired.',
  });

export const attachmentGetPreviewUrl = defineRequestContract({
  key: 'attachment.getPreviewUrl',
  channel: 'notera:attachment:get-preview-url',
  request: z.strictObject({ attachmentId: uuidSchema }),
  data: previewResultSchema,
  errors: attachmentErrors,
});

export const attachmentStartSaveAs = defineRequestContract({
  key: 'attachment.startSaveAs',
  channel: 'notera:attachment:start-save-as',
  request: z.strictObject({ attachmentId: uuidSchema }),
  data: startOperationResultSchema,
  errors: [...attachmentErrors, 'ATTACHMENT_SAVE_FAILED', 'DISK_FULL'],
});

export const attachmentContracts = {
  listForNote: attachmentListForNote,
  startImport: attachmentStartImport,
  removeFromNote: attachmentRemoveFromNote,
  getPreviewUrl: attachmentGetPreviewUrl,
  startSaveAs: attachmentStartSaveAs,
} as const;
