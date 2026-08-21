import { z } from 'zod';
import { emptyObjectSchema, uuidSchema } from '../common';
import { defineRequestContract } from '../contract';
import { entryRefSchema } from './content-tree';

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const targetsSchema = z
  .array(entryRefSchema)
  .min(1)
  .max(500)
  .refine((targets) => uniqueValues(targets.map((target) => target.id)), {
    message: 'Batch targets must be unique.',
  });
const noteIdsSchema = z
  .array(uuidSchema)
  .min(1)
  .max(500)
  .refine(uniqueValues, { message: 'Note identifiers must be unique.' });
const tagIdsSchema = z
  .array(uuidSchema)
  .min(1)
  .max(100)
  .refine(uniqueValues, { message: 'Tag identifiers must be unique.' });

const batchMutationErrors = [
  'PROFILE_LOCKED',
  'ENTITY_NOT_FOUND',
  'DUPLICATE_TARGET_ID',
  'INVALID_ENTITY_STATE',
  'PARENT_FOLDER_INVALID',
  'FOLDER_CYCLE',
  'SAVE_FAILED',
  'DISK_FULL',
  'IPC_OPERATION_FAILED',
] as const;

export const batchMove = defineRequestContract({
  key: 'batch.move',
  channel: 'notera:batch:move',
  request: z.strictObject({
    targets: targetsSchema,
    targetFolderId: uuidSchema,
  }),
  data: emptyObjectSchema,
  errors: batchMutationErrors,
});

export const batchAddTags = defineRequestContract({
  key: 'batch.addTags',
  channel: 'notera:batch:add-tags',
  request: z.strictObject({ noteIds: noteIdsSchema, tagIds: tagIdsSchema }),
  data: emptyObjectSchema,
  errors: batchMutationErrors,
});

export const batchRemoveTags = defineRequestContract({
  key: 'batch.removeTags',
  channel: 'notera:batch:remove-tags',
  request: z.strictObject({ noteIds: noteIdsSchema, tagIds: tagIdsSchema }),
  data: emptyObjectSchema,
  errors: batchMutationErrors,
});

export const batchCopy = defineRequestContract({
  key: 'batch.copy',
  channel: 'notera:batch:copy',
  request: z.strictObject({
    targets: targetsSchema,
    targetFolderId: uuidSchema,
  }),
  data: emptyObjectSchema,
  errors: batchMutationErrors,
});

export const batchTrash = defineRequestContract({
  key: 'batch.trash',
  channel: 'notera:batch:trash',
  request: z.strictObject({ targets: targetsSchema }),
  data: z.strictObject({ trashEntryIds: z.array(uuidSchema).min(1).max(500) }),
  errors: batchMutationErrors,
});

export const batchContracts = {
  move: batchMove,
  addTags: batchAddTags,
  removeTags: batchRemoveTags,
  copy: batchCopy,
  trash: batchTrash,
} as const;
