import { z } from 'zod';
import {
  emptyObjectSchema,
  limitedUnicodeString,
  timestampSchema,
  uuidSchema,
} from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { folderPathItemSchema } from './content-tree';

const trashItemBase = {
  trashEntryId: uuidSchema,
  objectId: uuidSchema,
  displayName: limitedUnicodeString(1000),
  folderPath: z.array(folderPathItemSchema).min(1).max(1000),
  deletedAt: timestampSchema,
  expiresAt: timestampSchema,
  originalParentAvailable: z.boolean(),
};

export const trashItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('folder'), ...trashItemBase }),
  z.strictObject({ kind: z.literal('note'), ...trashItemBase }),
]);

const trashMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'TRASH_ENTRY_EXPIRED',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const trashList = defineRequestContract({
  key: 'trash.list',
  channel: 'notera:trash:list',
  request: cursorPageRequestSchema,
  data: cursorPageSchema(trashItemSchema),
  errors: [
    'PROFILE_LOCKED',
    'INVALID_CURSOR',
    'DB_CORRUPT',
    'IPC_OPERATION_FAILED',
  ],
});

export const trashRestore = defineRequestContract({
  key: 'trash.restore',
  channel: 'notera:trash:restore',
  request: z.strictObject({
    trashEntryId: uuidSchema,
    targetFolderId: uuidSchema.optional(),
  }),
  data: emptyObjectSchema,
  errors: [
    ...trashMutationErrors,
    'TRASH_TARGET_REQUIRED',
    'PARENT_FOLDER_INVALID',
  ],
});

export const trashDeletePermanent = defineRequestContract({
  key: 'trash.deletePermanent',
  channel: 'notera:trash:delete-permanent',
  request: z.strictObject({ trashEntryId: uuidSchema }),
  data: z.strictObject({ deletedCount: z.number().int().min(0) }),
  errors: trashMutationErrors,
});

export const trashPurgeExpired = defineRequestContract({
  key: 'trash.purgeExpired',
  channel: 'notera:trash:purge-expired',
  request: emptyObjectSchema,
  data: z.strictObject({ deletedCount: z.number().int().min(0) }),
  errors: trashMutationErrors,
});

export const trashContracts = {
  list: trashList,
  restore: trashRestore,
  deletePermanent: trashDeletePermanent,
  purgeExpired: trashPurgeExpired,
} as const;
