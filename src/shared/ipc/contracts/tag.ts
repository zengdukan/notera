import { z } from 'zod';
import { emptyObjectSchema, limitedUnicodeString, uuidSchema } from '../common';
import { defineRequestContract } from '../contract';
import { cursorPageRequestSchema, cursorPageSchema } from '../pagination';
import { tagSummarySchema } from './note';

const tagNameSchema = limitedUnicodeString(100).refine(
  (value) => value.trim().length > 0,
  { message: 'Tag name cannot be blank.' },
);
const tagMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'INVALID_NAME',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const tagList = defineRequestContract({
  key: 'tag.list',
  channel: 'notera:tag:list',
  request: cursorPageRequestSchema,
  data: cursorPageSchema(tagSummarySchema),
  errors: ['PROFILE_LOCKED', 'INVALID_CURSOR', 'IPC_OPERATION_FAILED'],
});

export const tagCreate = defineRequestContract({
  key: 'tag.create',
  channel: 'notera:tag:create',
  request: z.strictObject({ name: tagNameSchema }),
  data: tagSummarySchema,
  errors: tagMutationErrors,
});

export const tagRename = defineRequestContract({
  key: 'tag.rename',
  channel: 'notera:tag:rename',
  request: z.strictObject({ tagId: uuidSchema, name: tagNameSchema }),
  data: tagSummarySchema,
  errors: tagMutationErrors,
});

export const tagDelete = defineRequestContract({
  key: 'tag.delete',
  channel: 'notera:tag:delete',
  request: z.strictObject({ tagId: uuidSchema }),
  data: emptyObjectSchema,
  errors: tagMutationErrors,
});

export const tagAddToNote = defineRequestContract({
  key: 'tag.addToNote',
  channel: 'notera:tag:add-to-note',
  request: z.strictObject({ noteId: uuidSchema, tagId: uuidSchema }),
  data: emptyObjectSchema,
  errors: tagMutationErrors,
});

export const tagRemoveFromNote = defineRequestContract({
  key: 'tag.removeFromNote',
  channel: 'notera:tag:remove-from-note',
  request: z.strictObject({ noteId: uuidSchema, tagId: uuidSchema }),
  data: emptyObjectSchema,
  errors: tagMutationErrors,
});

export const tagContracts = {
  list: tagList,
  create: tagCreate,
  rename: tagRename,
  delete: tagDelete,
  addToNote: tagAddToNote,
  removeFromNote: tagRemoveFromNote,
} as const;
